function filtrarFamilias() {
     // Pega o valor digitado no campo de busca
     let input = document.getElementById('inputBusca');
     let filtro = input.value.toLowerCase();
     let lista = document.getElementById('listaFamilias');
     let itens = lista.getElementsByClassName('familia-item');
 
     // Percorre todos os itens da lista e esconde os que não combinam
     for (let i = 0; i < itens.length; i++) {
         let textoFamilia = itens[i].innerText.toLowerCase();
         if (textoFamilia.indexOf(filtro) > -1) {
             itens[i].style.display = "";
         } else {
             itens[i].style.display = "none";
         }
     }
 }
 
 function verDetalhes(id) {
     if (typeof showToast === 'function') {
         showToast('info', 'Redirecionando', `Redirecionando para os detalhes da família #${id}`);
     } else {
         console.log("Redirecionando para os detalhes da família #" + id);
     }
     // Aqui você poderia usar: window.location.href = 'detalhes.html?id=' + id;
 }