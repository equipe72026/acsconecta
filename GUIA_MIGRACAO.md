# Guia de Migração — alert() e confirm() → SevenSys UI

## 1. Incluir em TODAS as páginas HTML

Adicione estas duas linhas no `<head>` de cada arquivo:

```html
<link rel="stylesheet" href="ui.css">
```

E antes do `</body>`:

```html
<script src="ui.js"></script>
```

---

## 2. Tabela de substituições por arquivo

---

### cadfam.html

**Sessão expirada**
```js
// ANTES
alert("Sessão expirada. Faça login novamente.");

// DEPOIS
showToast('error', 'Sessão expirada', 'Faça login novamente.');
```

**Campos inválidos**
```js
// ANTES
alert("Por favor, preencha corretamente todos os campos obrigatórios e verifique as formatações.");

// DEPOIS
showToast('warning', 'Campos incompletos', 'Preencha todos os campos obrigatórios corretamente.');
```

**Família cadastrada com sucesso**
```js
// ANTES
alert("Família completa cadastrada!");
window.location.href = "acsarea.html";

// DEPOIS
showToast('success', 'Família cadastrada!', 'Os dados foram salvos com sucesso.');
setTimeout(() => window.location.href = "acsarea.html", 1500);
```

---

### familiascadastradas.html

**Confirmar exclusão de família**
```js
// ANTES
if (confirm("Tem certeza que deseja excluir esta família? Esta ação não pode ser desfeita.")) {
    // ... lógica de exclusão
    alert("Família excluída e contadores atualizados!");
}

// DEPOIS
ssConfirm({
    titulo:     'Excluir família',
    subtitulo:  'Esta ação não pode ser desfeita',
    mensagem:   'Todos os dados desta família serão removidos permanentemente.',
    tipo:       'danger',
    textoBotao: 'Excluir',
    onConfirm:  function () {
        // ... cole aqui a lógica de exclusão que estava dentro do if(confirm)
        renderizarLista();
        showToast('success', 'Família excluída', 'Contadores atualizados.');
    }
});
```

**Detalhes não encontrados**
```js
// ANTES
alert("Detalhes não encontrados.");

// DEPOIS
showToast('error', 'Não encontrado', 'Detalhes da família não foram localizados.');
```

---

### cadastros.html

**Senha incorreta**
```js
// ANTES
alert('Senha incorreta! Acesso negado.');

// DEPOIS
showToast('error', 'Acesso negado', 'Senha do gerente incorreta.');
```

**Senhas não coincidem**
```js
// ANTES
alert('As senhas não coincidem!');

// DEPOIS
showToast('warning', 'Senhas diferentes', 'Os campos de senha precisam ser iguais.');
```

**Senha curta**
```js
// ANTES
alert('A senha deve ter no mínimo 8 caracteres!');

// DEPOIS
showToast('warning', 'Senha muito curta', 'A senha precisa ter no mínimo 8 caracteres.');
```

**Agente cadastrado com sucesso**
```js
// ANTES
alert('Agente de saúde cadastrado com sucesso!');
this.reset();
window.location.href = 'index.html';

// DEPOIS
showToast('success', 'Agente cadastrado!', 'O agente foi adicionado ao sistema.');
this.reset();
setTimeout(() => window.location.href = 'gerentedash.html', 1500);
```

---

### visfeita.html

**Relatório atualizado**
```js
// ANTES
alert("Relatório atualizado com sucesso!");

// DEPOIS
showToast('success', 'Relatório atualizado', 'As alterações foram salvas.');
```

**Confirmar exclusão de visita**
```js
// ANTES
if (confirm("Deseja realmente excluir o registro desta visita? O painel de pendências e o somatório serão reajustados.")) {
    // ... lógica
    alert("Registro de visita excluído! A visita retornou para a lista de Pendentes.");
}

// DEPOIS
ssConfirm({
    titulo:     'Excluir visita',
    subtitulo:  'Os contadores serão reajustados',
    mensagem:   'O registro será removido e a família voltará para a lista de pendentes.',
    tipo:       'danger',
    textoBotao: 'Excluir',
    onConfirm:  function () {
        // ... cole aqui a lógica de exclusão
        renderizarVisitas();
        showToast('success', 'Visita excluída', 'A família voltou para a lista de pendentes.');
    }
});
```

---

### visita.html

**Família não especificada**
```js
// ANTES
alert("Nenhuma família especificada.");
window.location.href = "vispen.html";

// DEPOIS
showToast('error', 'Família não encontrada', 'Nenhuma família foi especificada.');
setTimeout(() => window.location.href = "vispen.html", 1500);
```

**Família não localizada**
```js
// ANTES
alert("Família não localizada.");
window.location.href = "vispen.html";

// DEPOIS
showToast('error', 'Não encontrado', 'Família não localizada no sistema.');
setTimeout(() => window.location.href = "vispen.html", 1500);
```

**Visita registrada**
```js
// ANTES
alert("Visita registrada com sucesso! Indicadores atualizados no painel.");
window.location.href = "visfeita.html";

// DEPOIS
showToast('success', 'Visita registrada!', 'Indicadores atualizados no painel.');
setTimeout(() => window.location.href = "visfeita.html", 1500);
```

---

### login.html

**Bem-vindo**
```js
// ANTES
alert("Bem-vindo, " + usuarioEncontrado.nome + "!");
window.location.href = "acsarea.html";

// DEPOIS
showToast('success', 'Bem-vindo!', usuarioEncontrado.nome);
setTimeout(() => window.location.href = "acsarea.html", 1200);
```

**Usuário/senha incorretos**
```js
// ANTES
alert("Usuário ou senha incorretos.");

// DEPOIS
showToast('error', 'Acesso negado', 'Usuário ou senha incorretos.');
```

---

### gerentedash.html

**Agente excluído**
```js
// ANTES
alert(`Agente "${login}" removido com sucesso.`);

// DEPOIS
showToast('success', 'Agente removido', `O agente "${login}" foi excluído do sistema.`);
```

---

## 3. Referência rápida das funções

```js
// Toast — 4 tipos disponíveis
showToast('success', 'Título', 'Mensagem opcional');
showToast('error',   'Título', 'Mensagem opcional');
showToast('warning', 'Título', 'Mensagem opcional');
showToast('info',    'Título', 'Mensagem opcional');

// Modal de confirmação
ssConfirm({
    titulo:     'Texto do cabeçalho',
    subtitulo:  'Linha menor abaixo do título',
    mensagem:   'Texto explicativo no corpo do modal.',
    tipo:       'danger',      // 'danger' | 'warning' | 'info'
    textoBotao: 'Confirmar',   // texto do botão de ação
    onConfirm:  function () {
        // código executado ao clicar em confirmar
    }
});
```
