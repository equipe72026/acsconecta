/* ============================================================
   logs-acesso.js — Tela "Logs de Autenticação" (admin e gerente)
   Portada do ACS Conecta (2.0). Injeta um botão na barra de seção
   e um modal, usando as classes já existentes dos dashboards
   (.modal-overlay, .modal-box, .btn, .table-wrap, .search-input...).

   Incluir no fim do <body> de admindash.html e gerentedash.html:
     <script src="logs-acesso.js"></script>
   Também abre direto por admindash.html#logs / gerentedash.html#logs
   ============================================================ */
(function () {
    'use strict';

    var ROTULO_PERFIL = { agente: 'ACS', gerente: 'Gerente', administrador: 'Administrador' };

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    function lerLogs() {
        try { return JSON.parse(localStorage.getItem('logs_autenticacao')) || []; }
        catch (e) { return []; }
    }

    function injetarEstilos() {
        var st = document.createElement('style');
        st.textContent =
            '.sslog-filtros{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px}' +
            '.sslog-filtros .search-input{flex:1 1 200px;min-width:0}' +
            '.sslog-tag{display:inline-block;padding:3px 9px;border-radius:8px;font-size:.75rem;font-weight:700;white-space:nowrap}' +
            '.sslog-2fa{background:rgba(142,68,173,.14);color:#8e44ad}' +
            '.sslog-ok{background:rgba(39,174,96,.15);color:#27ae60}' +
            '.sslog-falha{background:rgba(231,76,60,.15);color:#e74c3c}' +
            '.sslog-total{font-size:.82rem;color:var(--muted,#7f8c8d);margin-top:12px}' +
            '#modalLogs .modal-box{max-width:960px;width:96%}' +
            '#modalLogs .table-wrap{max-height:55vh;overflow:auto}';
        document.head.appendChild(st);
    }

    function montarModal() {
        var m = document.createElement('div');
        m.className = 'modal-overlay';
        m.id = 'modalLogs';
        m.innerHTML =
            '<div class="modal-box">' +
                '<div class="modal-header">' +
                    '<h3>🔐 Logs de Autenticação</h3>' +
                    '<button class="modal-close" type="button" id="sslogFechar" aria-label="Fechar">✕</button>' +
                '</div>' +
                '<div class="modal-body">' +
                    '<div class="sslog-filtros">' +
                        '<select class="filter-select" id="sslogTipo" aria-label="Filtrar por">' +
                            '<option value="todos">Todos os registros</option>' +
                            '<option value="nome">Filtrar por nome</option>' +
                            '<option value="cpf">Filtrar por CPF</option>' +
                            '<option value="login">Filtrar por usuário</option>' +
                        '</select>' +
                        '<input type="text" class="search-input" id="sslogValor" disabled ' +
                            'placeholder="Selecione o tipo de filtro ao lado">' +
                        '<select class="filter-select" id="sslogResultado" aria-label="Resultado">' +
                            '<option value="todos">Todos os resultados</option>' +
                            '<option value="sucesso">Somente sucessos</option>' +
                            '<option value="falha">Somente falhas</option>' +
                        '</select>' +
                    '</div>' +
                    '<div class="table-wrap">' +
                        '<table>' +
                            '<thead><tr>' +
                                '<th>Data / Hora</th><th>Nome</th><th>CPF</th>' +
                                '<th>Perfil</th><th>2º Fator (2FA)</th><th>Resultado</th>' +
                            '</tr></thead>' +
                            '<tbody id="sslogCorpo"></tbody>' +
                        '</table>' +
                    '</div>' +
                    '<p class="sslog-total" id="sslogTotal"></p>' +
                    '<div style="display:flex;justify-content:flex-end;margin-top:16px">' +
                        '<button type="button" class="btn btn-outline" id="sslogFechar2">Fechar</button>' +
                    '</div>' +
                '</div>' +
            '</div>';
        document.body.appendChild(m);
        return m;
    }

    function renderizar() {
        var tipo = document.getElementById('sslogTipo').value;
        var termo = document.getElementById('sslogValor').value.trim();
        var resultado = document.getElementById('sslogResultado').value;

        var logs = lerLogs().slice().sort(function (a, b) {
            return new Date(b.dataHora) - new Date(a.dataHora);   // mais recente primeiro
        });

        if (tipo !== 'todos' && termo) {
            if (tipo === 'cpf') {
                var t = termo.replace(/\D/g, '');
                logs = logs.filter(function (l) { return t && (l.cpf || '').replace(/\D/g, '').indexOf(t) !== -1; });
            } else {
                var campo = tipo === 'nome' ? 'nome' : 'login';
                var low = termo.toLowerCase();
                logs = logs.filter(function (l) { return (l[campo] || '').toLowerCase().indexOf(low) !== -1; });
            }
        }
        if (resultado !== 'todos') {
            // registros do 2.0 não tinham "resultado": eram sempre sucessos
            logs = logs.filter(function (l) { return (l.resultado || 'sucesso') === resultado; });
        }

        var tbody = document.getElementById('sslogCorpo');
        if (logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:22px;color:var(--muted,#7f8c8d)">Nenhum registro de acesso encontrado.</td></tr>';
        } else {
            tbody.innerHTML = logs.map(function (l) {
                var dt = new Date(l.dataHora);
                var data = isNaN(dt.getTime()) ? '—' : dt.toLocaleString('pt-BR');
                var perfil = ROTULO_PERFIL[l.tipo] || 'ACS';
                var ok = (l.resultado || 'sucesso') === 'sucesso';
                return '<tr>' +
                    '<td style="white-space:nowrap">' + esc(data) + '</td>' +
                    '<td><strong>' + esc(l.nome || '—') + '</strong></td>' +
                    '<td style="white-space:nowrap">' + esc(l.cpf || '—') + '</td>' +
                    '<td>' + esc(perfil) + '</td>' +
                    '<td><span class="sslog-tag sslog-2fa">' + esc(l.fator2FA || '—') + '</span></td>' +
                    '<td><span class="sslog-tag ' + (ok ? 'sslog-ok' : 'sslog-falha') + '">' + (ok ? 'Sucesso' : 'Falha') + '</span></td>' +
                '</tr>';
            }).join('');
        }
        document.getElementById('sslogTotal').textContent = logs.length + ' registro(s) encontrado(s).';
    }

    function abrir() {
        document.getElementById('sslogTipo').value = 'todos';
        document.getElementById('sslogResultado').value = 'todos';
        var v = document.getElementById('sslogValor');
        v.value = ''; v.disabled = true;
        v.placeholder = 'Selecione o tipo de filtro ao lado';
        renderizar();
        if (typeof window.abrirModal === 'function') window.abrirModal('modalLogs');
        else document.getElementById('modalLogs').classList.add('open');
    }

    function fechar() {
        if (typeof window.fecharModal === 'function') window.fecharModal('modalLogs');
        else document.getElementById('modalLogs').classList.remove('open');
        if (window.location.hash === '#logs') history.replaceState(null, '', window.location.pathname);
    }

    function init() {
        // Só para quem passou pela autenticação de gerente/administrador
        if (sessionStorage.getItem('gerenteAutenticado') !== 'true') return;

        injetarEstilos();
        var modal = montarModal();

        var barra = document.querySelector('.section-header > div:last-child') ||
                    document.querySelector('.section-header');
        if (barra) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'btn btn-outline';
            btn.textContent = '🔐 Logs de acesso';
            btn.addEventListener('click', abrir);
            barra.appendChild(btn);
        }

        document.getElementById('sslogTipo').addEventListener('change', function () {
            var v = document.getElementById('sslogValor');
            if (this.value === 'todos') {
                v.value = ''; v.disabled = true;
                v.placeholder = 'Selecione o tipo de filtro ao lado';
            } else {
                v.disabled = false;
                v.placeholder = { nome: 'Digite o nome...', cpf: 'Digite o CPF...', login: 'Digite o usuário...' }[this.value];
                v.focus();
            }
            renderizar();
        });
        document.getElementById('sslogValor').addEventListener('input', renderizar);
        document.getElementById('sslogResultado').addEventListener('change', renderizar);
        document.getElementById('sslogFechar').addEventListener('click', fechar);
        document.getElementById('sslogFechar2').addEventListener('click', fechar);
        modal.addEventListener('click', function (e) { if (e.target === modal) fechar(); });

        if (window.location.hash === '#logs') abrir();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
