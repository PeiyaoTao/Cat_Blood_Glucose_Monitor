const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const db = cloud.database()
  const _ = db.command

  const { action, payload } = event

  // Helper: check if user has access to a cat
  // returns the cat doc if access is granted, otherwise throws error
  const checkCatAccess = async (catId) => {
    if (!catId) throw new Error('Missing catId')
    const { data } = await db.collection('cats').doc(catId).get()
    if (data._openid === openid || (data.shared_with && data.shared_with.includes(openid))) {
      return data
    }
    throw new Error('Access denied')
  }

  try {
    switch (action) {
      case 'bindSharedCat': {
        const { inviter } = payload
        if (!inviter) throw new Error('Missing inviter param')
        
        // Find cats created by the inviter
        const { data: inviterCats } = await db.collection('cats').where({
          _openid: inviter
        }).get()
        
        let modified = 0
        for (let cat of inviterCats) {
          if (cat._openid === openid) continue // skip own cats
          const sharedWith = cat.shared_with || []
          if (!sharedWith.includes(openid)) {
            await db.collection('cats').doc(cat._id).update({
              data: {
                shared_with: _.push(openid)
              }
            })
            modified++
          }
        }
        return { success: true, modified }
      }

      case 'unbindSharedCat': {
        const { catId } = payload
        const cat = await checkCatAccess(catId)
        if (cat._openid === openid) {
          throw new Error('You are the creator, use deleteCat instead')
        }
        // Remove self from shared_with
        await db.collection('cats').doc(catId).update({
          data: {
            shared_with: _.pull(openid)
          }
        })
        return { success: true }
      }

      case 'getCats': {
        const { data } = await db.collection('cats').where(_.or([
          { _openid: openid },
          { shared_with: openid }
        ])).get()
        return { success: true, data }
      }

      case 'saveCat': {
        const { catId, catData } = payload
        if (catId) {
          // Update existing cat
          const cat = await checkCatAccess(catId)
          await db.collection('cats').doc(catId).update({
            data: catData
          })
          return { success: true, id: catId }
        } else {
          // Add new cat
          catData.shared_with = []
          catData._openid = openid // Server assigns openid implicitly, but we can set it
          const res = await db.collection('cats').add({
            data: catData
          })
          return { success: true, id: res._id }
        }
      }

      case 'deleteCat': {
        const { catId } = payload
        const cat = await checkCatAccess(catId)
        if (cat._openid !== openid) {
          throw new Error('Only the creator can delete the cat completely')
        }
        // Delete the cat
        await db.collection('cats').doc(catId).remove()
        
        // Also delete related records
        await db.collection('blood_glucose').where({ cat_id: catId }).remove()
        await db.collection('insulin_records').where({ cat_id: catId }).remove()
        await db.collection('weight_records').where({ cat_id: catId }).remove()
        
        return { success: true }
      }

      case 'getRecords': {
        const { catId, type, limit = 20, skip = 0 } = payload
        await checkCatAccess(catId)
        const collectionName = type // e.g. 'blood_glucose', 'insulin_records', 'weight_records'
        const { data } = await db.collection(collectionName)
          .where({ cat_id: catId })
          .orderBy('createTime', 'desc')
          .skip(skip)
          .limit(limit)
          .get()
        return { success: true, data }
      }

      case 'addRecord': {
        const { type, recordData } = payload
        await checkCatAccess(recordData.cat_id)
        const collectionName = type
        const res = await db.collection(collectionName).add({
          data: recordData
        })
        return { success: true, id: res._id }
      }

      case 'deleteRecord': {
        const { catId, type, recordId } = payload
        await checkCatAccess(catId)
        const collectionName = type
        
        // Extra check: if user is not creator of the cat, they can only delete their own records
        // Wait, family sharing logic: should family members be able to delete any records? 
        // We will allow anyone with access to the cat to delete records for now.
        
        await db.collection(collectionName).doc(recordId).remove()
        return { success: true }
      }

      default:
        throw new Error(`Unknown action: ${action}`)
    }
  } catch (err) {
    console.error(`Error executing action ${action}:`, err)
    return { success: false, error: err.message }
  }
}
