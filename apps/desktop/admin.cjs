const {join,resolve}=require('node:path');
async function provision(profile,input){
 if(!input||typeof input.email!=='string'||typeof input.name!=='string'||Object.keys(input).some(k=>!['email','name'].includes(k)))throw new Error('Confira o e-mail e o nome do Studio.');
 const {Store,provisionStudio}=require(resolve(__dirname,'../../dist-api/operator.cjs'));
 return new Store(join(profile,'data')).transact(s=>provisionStudio(s,input.email,input.name));
}
module.exports={provision};
