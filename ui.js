// ============================================================
//  SevenSys UI — Notificações e Modais
//  Inclua este arquivo em todas as páginas:
//  <script src="ui.js"></script>
// ============================================================

// --- Injeta o HTML base (toast container + modal container) ---
document.addEventListener('DOMContentLoaded', function () {
    // Container dos toasts
    if (!document.getElementById('ss-toast-container')) {
        const tc = document.createElement('div');
        tc.id = 'ss-toast-container';
        document.body.appendChild(tc);
    }

    // Container do modal de confirmação
    if (!document.getElementById('ss-modal-overlay')) {
        const mo = document.createElement('div');
        mo.id = 'ss-modal-overlay';
        mo.innerHTML = `
            <div id="ss-modal-box">
                <div id="ss-modal-header">
                    <div id="ss-modal-icon-wrap">
                        <span id="ss-modal-icon">!</span>
                    </div>
                    <div>
                        <div id="ss-modal-title">Confirmar ação</div>
                        <div id="ss-modal-subtitle"></div>
                    </div>
                </div>
                <div id="ss-modal-body"></div>
                <div id="ss-modal-footer">
                    <button id="ss-modal-cancel">Cancelar</button>
                    <button id="ss-modal-confirm">Confirmar</button>
                </div>
            </div>
        `;
        document.body.appendChild(mo);

        // Fechar clicando fora
        mo.addEventListener('click', function (e) {
            if (e.target === mo) ssCloseModal();
        });

        // Fechar com ESC
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') ssCloseModal();
        });

        document.getElementById('ss-modal-cancel').addEventListener('click', ssCloseModal);
    }
});

// ============================================================
//  TOAST
//  Uso: showToast('success', 'Título', 'Mensagem opcional')
//  Tipos: 'success' | 'error' | 'warning' | 'info'
// ============================================================
const TOAST_DURATION = 3000;

const TOAST_CONFIG = {
    success: { cor: '#27ae60', icone: '✓' },
    error:   { cor: '#e74c3c', icone: '✕' },
    warning: { cor: '#f39c12', icone: '⚠' },
    info:    { cor: '#109ea3', icone: 'ℹ' },
};

function showToast(tipo, titulo, mensagem) {
    const container = document.getElementById('ss-toast-container');
    if (!container) return;

    const cfg = TOAST_CONFIG[tipo] || TOAST_CONFIG.info;

    const toast = document.createElement('div');
    toast.className = 'ss-toast ss-toast-' + tipo;
    toast.style.borderLeftColor = cfg.cor;
    toast.innerHTML = `
        <span class="ss-toast-icon" style="color:${cfg.cor}">${cfg.icone}</span>
        <div class="ss-toast-body">
            <div class="ss-toast-title">${titulo}</div>
            ${mensagem ? `<div class="ss-toast-msg">${mensagem}</div>` : ''}
        </div>
        <button class="ss-toast-close" aria-label="Fechar">×</button>
        <div class="ss-toast-bar" style="background:${cfg.cor}; animation-duration:${TOAST_DURATION}ms"></div>
    `;

    toast.querySelector('.ss-toast-close').addEventListener('click', () => dismissToast(toast));
    container.appendChild(toast);

    // Remove automaticamente
    const timer = setTimeout(() => dismissToast(toast), TOAST_DURATION);
    toast._timer = timer;
}

function dismissToast(el) {
    if (!el || el.classList.contains('ss-hiding')) return;
    clearTimeout(el._timer);
    el.classList.add('ss-hiding');
    setTimeout(() => el && el.remove(), 280);
}

// ============================================================
//  MODAL DE CONFIRMAÇÃO
//  Uso:
//    ssConfirm({
//        titulo:    'Excluir agente',
//        subtitulo: 'Esta ação não pode ser desfeita',
//        mensagem:  'Todos os dados serão removidos permanentemente.',
//        tipo:      'danger',         // 'danger' | 'warning' | 'info'
//        textoBotao: 'Excluir',       // texto do botão de confirmação
//        onConfirm: function() { ... } // callback ao confirmar
//    });
// ============================================================
function ssConfirm(opcoes) {
    const overlay  = document.getElementById('ss-modal-overlay');
    const box      = document.getElementById('ss-modal-box');
    const iconWrap = document.getElementById('ss-modal-icon-wrap');
    const icon     = document.getElementById('ss-modal-icon');
    const title    = document.getElementById('ss-modal-title');
    const subtitle = document.getElementById('ss-modal-subtitle');
    const body     = document.getElementById('ss-modal-body');
    const btnConf  = document.getElementById('ss-modal-confirm');
    const btnCanc  = document.getElementById('ss-modal-cancel');

    if (!overlay) return;

    // Cores e ícones por tipo
    const estilos = {
        danger:  { bg: '#fde8e6', cor: '#e74c3c', icone: '🗑', btnBg: '#e74c3c' },
        warning: { bg: '#fef3e2', cor: '#f39c12', icone: '⚠',  btnBg: '#f39c12' },
        info:    { bg: '#e6f7f7', cor: '#109ea3', icone: 'ℹ',  btnBg: '#109ea3' },
    };
    const est = estilos[opcoes.tipo || 'info'];

    iconWrap.style.background = est.bg;
    iconWrap.style.color      = est.cor;
    icon.textContent           = est.icone;
    title.textContent          = opcoes.titulo    || 'Confirmar';
    subtitle.textContent       = opcoes.subtitulo || '';
    body.textContent           = opcoes.mensagem  || '';
    btnConf.textContent        = opcoes.textoBotao || 'Confirmar';
    btnConf.style.background   = est.btnBg;

    // Remove listener antigo e adiciona novo
    const novoBtn = btnConf.cloneNode(true);
    novoBtn.style.background = est.btnBg;
    novoBtn.textContent = opcoes.textoBotao || 'Confirmar';
    btnConf.parentNode.replaceChild(novoBtn, btnConf);

    novoBtn.addEventListener('click', function () {
        ssCloseModal();
        if (typeof opcoes.onConfirm === 'function') opcoes.onConfirm();
    });

    overlay.classList.add('ss-open');
    setTimeout(() => box.classList.add('ss-open'), 10);
}

function ssCloseModal() {
    const overlay = document.getElementById('ss-modal-overlay');
    const box     = document.getElementById('ss-modal-box');
    if (!overlay) return;
    box.classList.remove('ss-open');
    setTimeout(() => overlay.classList.remove('ss-open'), 200);
}
