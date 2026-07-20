export const callApi = async (action: string, payload: any = {}) => {
  // @ts-ignore
  if (typeof wx === 'undefined' || !wx.cloud) {
    console.error('wx.cloud is not available')
    throw new Error('wx.cloud is not available')
  }
  
  try {
    // @ts-ignore
    const res = await wx.cloud.callFunction({
      name: 'api',
      data: {
        action,
        payload
      }
    })
    
    if (res.result && res.result.success) {
      return res.result
    } else {
      console.error(`API Error (${action}):`, res.result?.error)
      throw new Error(res.result?.error || 'Unknown API Error')
    }
  } catch (err) {
    console.error(`Cloud function call failed (${action}):`, err)
    throw err
  }
}
