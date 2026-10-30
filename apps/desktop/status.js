const query=new URLSearchParams(location.search);
if(query.get('state')==='admin'){
 document.getElementById('title').textContent='Preparar este Studio.';
 document.getElementById('message').textContent='Administração desta instalação pelo operador autorizado do Windows. A API está pausada. Use uma conta já cadastrada; depois volte ao Forma nesta janela.';
 document.getElementById('progress').hidden=true;document.getElementById('operator').hidden=false;
 document.getElementById('actions').hidden=false;document.getElementById('retry').hidden=false;document.getElementById('retry').textContent='Voltar ao Forma';
}
if(query.get('state')==='error'){
 document.getElementById('title').textContent='Seu espaço não pôde iniciar.';
 document.getElementById('message').textContent=query.get('message')||'Preserve seus dados, verifique a instalação e tente novamente.';
 document.getElementById('progress').hidden=true;document.getElementById('actions').hidden=false;
}
document.getElementById('retry').addEventListener('click',async()=>{const back=document.getElementById('retry');back.disabled=true;try{if(!await window.formaDesktop.retry())back.disabled=false;}catch{back.disabled=false;}});
document.getElementById('quit').addEventListener('click',()=>window.formaDesktop.quit());
document.getElementById('operator').addEventListener('submit',async event=>{
 event.preventDefault();const button=document.getElementById('provision');if(button.disabled)return;button.disabled=true;const back=document.getElementById('retry');back.disabled=true;
 try{
  const form=new FormData(event.currentTarget),result=await window.formaDesktop.provision({email:String(form.get('email')),name:String(form.get('name'))});
  document.getElementById('message').textContent=result.message;
  if(result.ok)document.getElementById('operator').hidden=true;
 }catch{document.getElementById('message').textContent='Não foi possível preparar o Studio. Confira os campos e tente novamente.';}
 finally{button.disabled=false;back.disabled=false;}
});
