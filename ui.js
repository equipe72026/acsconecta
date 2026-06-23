/* =========================================================
   SevenSys — ui.js
   Lógica central de tema (Modo Claro / Modo Escuro)
   Esta lógica é compartilhada por TODAS as páginas que
   incluem <script src="ui.js"></script>.
   ========================================================= */

(function () {
    const root = document.documentElement;

    // Ícones SVG inline (sol = ativar modo claro, lua = ativar modo escuro).
    // O ícone exibido é o do estado que o clique VAI ativar, então:
    // - tema claro ativo -> mostra lua (clique ativa o escuro)
    // - tema escuro ativo -> mostra sol (clique ativa o claro)
    const ICONE_LUA = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z"></path></svg>';
    const ICONE_SOL = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"></path></svg>';

    // Aplica o tema salvo o mais rápido possível, ANTES da página
    // terminar de carregar, para não dar "flash" de tela clara.
    // Usamos <html> porque ele já existe mesmo quando este script
    // roda dentro do <head>, antes do <body> ser criado.
    function aplicarTemaSalvo() {
        const temaSalvo = localStorage.getItem('theme');
        root.classList.toggle('dark-mode', temaSalvo === 'dark');
        if (document.body) {
            document.body.classList.toggle('dark-mode', temaSalvo === 'dark');
        }
    }

    aplicarTemaSalvo();

    document.addEventListener('DOMContentLoaded', function () {
        aplicarTemaSalvo();
        sincronizarBotoesDeTema();
    });

    // Alterna o tema atual e propaga a escolha para qualquer botão
    // de toggle presente na página (ex: #ss-dark-mode-toggle).
    function alternarTema() {
        const ativo = !root.classList.contains('dark-mode');
        root.classList.toggle('dark-mode', ativo);
        if (document.body) document.body.classList.toggle('dark-mode', ativo);
        localStorage.setItem('theme', ativo ? 'dark' : 'light');
        sincronizarBotoesDeTema();
    }

    // Atualiza o ícone (sol/lua) de qualquer botão de tema presente na página
    function sincronizarBotoesDeTema() {
        const escuroAtivo = root.classList.contains('dark-mode');
        document.querySelectorAll('[data-theme-toggle], #ss-dark-mode-toggle').forEach(function (btn) {
            btn.innerHTML = escuroAtivo ? ICONE_SOL : ICONE_LUA;
            btn.setAttribute('aria-label', escuroAtivo ? 'Ativar modo claro' : 'Ativar modo escuro');
            btn.setAttribute('title', escuroAtivo ? 'Modo Claro' : 'Modo Noturno');
        });
    }

    // Liga o clique de qualquer botão marcado com [data-theme-toggle]
    // (ou com o id antigo #ss-dark-mode-toggle, por compatibilidade)
    document.addEventListener('click', function (e) {
        const btn = e.target.closest('[data-theme-toggle], #ss-dark-mode-toggle');
        if (btn) alternarTema();
    });

    // Expõe globalmente, caso alguma página precise chamar manualmente
    window.SevenSysTema = {
        alternar: alternarTema,
        aplicarSalvo: aplicarTemaSalvo
    };
})();

/* =========================================================
   Toast helper (showToast) usado em várias páginas do sistema.
   Mantido aqui para garantir que todas as páginas que incluem
   ui.js tenham a função disponível.
   ========================================================= */
function showToast(tipo, titulo, mensagem) {
    const escuro = document.documentElement.classList.contains('dark-mode');

    let container = document.getElementById('ss-toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'ss-toast-container';
        container.style.position = 'fixed';
        container.style.top = '20px';
        container.style.right = '20px';
        container.style.zIndex = '9999';
        container.style.display = 'flex';
        container.style.flexDirection = 'column';
        container.style.gap = '10px';
        document.body.appendChild(container);
    }

    const cores = {
        success: '#27ae60',
        error:   '#e74c3c',
        warning: '#f39c12',
        info:    '#109ea3'
    };

    const toast = document.createElement('div');
    toast.style.background = escuro ? '#1c2226' : '#ffffff';
    toast.style.borderLeft = '4px solid ' + (cores[tipo] || cores.info);
    toast.style.borderRadius = '8px';
    toast.style.padding = '12px 16px';
    toast.style.boxShadow = escuro ? '0 4px 14px rgba(0,0,0,0.5)' : '0 4px 14px rgba(0,0,0,0.15)';
    toast.style.minWidth = '260px';
    toast.style.maxWidth = '340px';
    toast.style.fontFamily = "'Segoe UI', Arial, sans-serif";
    toast.style.color = escuro ? '#e8edf0' : '#2c3e50';
    toast.innerHTML = '<strong style="display:block;margin-bottom:2px;">' + titulo + '</strong>' +
        '<span style="font-size:0.88rem;color:' + (escuro ? '#9aa7ad' : '#7f8c8d') + ';">' + mensagem + '</span>';

    container.appendChild(toast);
    setTimeout(function () {
        toast.style.transition = 'opacity 0.3s, transform 0.3s';
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(20px)';
        setTimeout(function () { toast.remove(); }, 300);
    }, 4000);
}

/* =========================================================
   ssConfirm — modal de confirmação genérico, usado em páginas
   que precisam confirmar ações destrutivas (ex: excluir família,
   excluir visita) antes de executá-las.

   Uso:
   ssConfirm({
       titulo: 'Excluir item',
       subtitulo: 'Esta ação não pode ser desfeita.',
       mensagem: 'Deseja realmente excluir?',
       tipo: 'danger',           // 'danger' (vermelho) ou 'default' (teal)
       textoBotao: 'Excluir',
       onConfirm: function () { ... }
   });
   ========================================================= */
function ssConfirm(opcoes) {
    const config = Object.assign({
        titulo: 'Confirmar ação',
        subtitulo: '',
        mensagem: 'Tem certeza que deseja continuar?',
        tipo: 'default',
        textoBotao: 'Confirmar',
        textoCancelar: 'Cancelar',
        onConfirm: function () {},
        onCancel: function () {}
    }, opcoes || {});

    const escuro = document.documentElement.classList.contains('dark-mode');
    const corBotao = config.tipo === 'danger' ? '#e74c3c' : '#109ea3';
    const corBotaoHover = config.tipo === 'danger' ? '#c0392b' : '#0b777a';

    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.background = 'rgba(0,0,0,0.45)';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.padding = '18px';
    overlay.style.zIndex = '99999';

    const box = document.createElement('div');
    box.style.width = '100%';
    box.style.maxWidth = '420px';
    box.style.background = escuro ? '#1c2226' : '#ffffff';
    box.style.color = escuro ? '#e8edf0' : '#2c3e50';
    box.style.borderRadius = '16px';
    box.style.overflow = 'hidden';
    box.style.boxShadow = '0 24px 70px rgba(0,0,0,0.25)';
    box.style.fontFamily = "'Segoe UI', Arial, sans-serif";

    const subtituloHtml = config.subtitulo
        ? '<p style="margin:4px 0 0;font-size:0.85rem;color:' + (escuro ? '#9aa7ad' : '#7f8c8d') + ';">' + config.subtitulo + '</p>'
        : '';

    box.innerHTML = `
        <div style="padding:22px 24px 6px;">
            <h3 style="margin:0;font-size:1.1rem;font-weight:700;color:${config.tipo === 'danger' ? '#e74c3c' : (escuro ? '#1ec2c7' : '#109ea3')};">${config.titulo}</h3>
            ${subtituloHtml}
        </div>
        <div style="padding:14px 24px 22px;font-size:0.95rem;line-height:1.6;">${config.mensagem}</div>
        <div style="display:flex;justify-content:flex-end;gap:10px;padding:14px 24px;background:${escuro ? '#20272c' : '#f8fbfc'};">
            <button type="button" data-ss-cancel style="border:none;border-radius:999px;padding:10px 18px;font-weight:700;cursor:pointer;background:${escuro ? '#2a3137' : '#eef2f7'};color:${escuro ? '#c7d0d4' : '#475569'};font-family:inherit;">${config.textoCancelar}</button>
            <button type="button" data-ss-confirm style="border:none;border-radius:999px;padding:10px 18px;font-weight:700;cursor:pointer;background:${corBotao};color:#fff;font-family:inherit;">${config.textoBotao}</button>
        </div>
    `;

    overlay.appendChild(box);
    document.body.appendChild(overlay);

    function fechar() {
        overlay.remove();
    }

    box.querySelector('[data-ss-confirm]').addEventListener('mouseenter', function () {
        this.style.background = corBotaoHover;
    });
    box.querySelector('[data-ss-confirm]').addEventListener('mouseleave', function () {
        this.style.background = corBotao;
    });

    box.querySelector('[data-ss-cancel]').addEventListener('click', function () {
        fechar();
        config.onCancel();
    });
    box.querySelector('[data-ss-confirm]').addEventListener('click', function () {
        fechar();
        config.onConfirm();
    });
    overlay.addEventListener('click', function (e) {
        if (e.target === overlay) {
            fechar();
            config.onCancel();
        }
    });
}
