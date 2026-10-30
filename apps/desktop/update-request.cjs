function registerUpdateRequest(ipcMain,isAppSender,check){
 ipcMain.handle('forma:update:check',async event=>{
  if(!isAppSender(event))return false;
  await check();return true;
 });
}
module.exports={registerUpdateRequest};
