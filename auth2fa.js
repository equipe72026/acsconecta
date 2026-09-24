/* ============================================================
   auth2fa.js — Verificação em 2 etapas (2FA) + logs de autenticação
   Portado do ACS Conecta (2.0) para o SevenSys (1.0).

   Uso:
     SS2FA.verificar(conta, 'agente' | 'gerente' | 'administrador', {
        onSucesso:  function () { ... },   // 2FA aprovado (ou não aplicável)
        onCancelar: function () { ... }    // cancelou ou errou 3 vezes
     });

   Logs: localStorage['logs_autenticacao'] — mesmo formato do 2.0
     { dataHora, nome, cpf, login, fator2FA }
   + campos novos: tipo, unidade, resultado ('sucesso' | 'falha')
   ============================================================ */
(function () {
    'use strict';

    var CHAVE_LOGS = 'logs_autenticacao';
    var MAX_LOGS = 1000;        // mantém só os 1000 registros mais recentes
    var MAX_TENTATIVAS = 3;

    // Mapeamento dos campos do 2.0 para os campos do cadastro do 1.0:
    // motherName -> nomeMae | birthdate -> dataNascimento | cep -> cep
    var PERGUNTAS = [
        { campo: 'nomeMae',        texto: 'Qual o nome da sua mãe?',        label: 'Nome da mãe',        dica: 'Nome completo da mãe', tipo: 'texto' },
        { campo: 'dataNascimento', texto: 'Qual a data do seu nascimento?', label: 'Data de nascimento', dica: 'dd/mm/aaaa',           tipo: 'data'  },
        { campo: 'cep',            texto: 'Qual o CEP do seu endereço?',    label: 'CEP',                dica: '00000-000',            tipo: 'cep'   }
    ];

    // ── Normalização / comparação ──────────────────────────────
    function semAcento(v) {
        return String(v == null ? '' : v).trim().toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/\s+/g, ' ');
    }
    function soDigitos(v) {
        return String(v == null ? '' : v).replace(/\D/g, '');
    }
    // Aceita "yyyy-mm-dd" (formato do <input type=date>) ou "dd/mm/yyyy" e devolve "ddmmyyyy"
    function normData(v) {
        var s = String(v == null ? '' : v).trim();
        var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (m) return m[3] + m[2] + m[1];
        return soDigitos(s);
    }
    function confere(pergunta, resposta, correto) {
        if (pergunta.tipo === 'texto') {
            var a = semAcento(resposta);
            return a !== '' && a === semAcento(correto);
        }
        if (pergunta.tipo === 'data') {
            var d = normData(resposta);
            return d.length === 8 && d === normData(correto);
        }
        var c = soDigitos(resposta);
        return c !== '' && c === soDigitos(correto);
    }

    // ── Logs ───────────────────────────────────────────────────
    function lerLogs() {
        try { return JSON.parse(localStorage.getItem(CHAVE_LOGS)) || []; }
        catch (e) { return []; }
    }
    function registrarLog(conta, tipo, fator, resultado) {
        var logs = lerLogs();
        logs.push({
            dataHora: new Date().toISOString(),
            nome: conta.nome || conta.name || conta.usuario || conta.login || '',
            cpf: conta.cpf || '',
            login: conta.usuario || conta.login || '',
            tipo: tipo,
            unidade: conta.unidadeSaude || '',
            fator2FA: fator,
            resultado: resultado
        });
        if (logs.length > MAX_LOGS) logs = logs.slice(-MAX_LOGS);
        try { localStorage.setItem(CHAVE_LOGS, JSON.stringify(logs)); } catch (e) { /* storage cheio */ }
    }

    function toast(tipo, titulo, msg) {
        if (typeof showToast === 'function') showToast(tipo, titulo, msg);
    }

    // ── Interface (modal) ──────────────────────────────────────
    var modal = null;
    var estado = null; // { conta, tipo, pergunta, tentativas, cb }

    function injetarEstilos() {
        if (document.getElementById('ss2fa-style')) return;
        var st = document.createElement('style');
        st.id = 'ss2fa-style';
        st.textContent =
            '.ss2fa-overlay{display:none;position:fixed;inset:0;z-index:1200;background:rgba(0,0,0,.55);align-items:center;justify-content:center;padding:16px}' +
            '.ss2fa-overlay.open{display:flex}' +
            '.ss2fa-box{background:#fff;color:#2c3e50;width:100%;max-width:380px;border-radius:12px;padding:34px 30px 26px;box-shadow:0 8px 32px rgba(0,0,0,.25);text-align:center;font-family:Arial,sans-serif;border-top:6px solid #109ea3}' +
            '.ss2fa-box h2{color:#109ea3;font-size:1.2rem;margin:0 0 6px}' +
            '.ss2fa-sub{color:#666;font-size:.88rem;margin:0 0 4px}' +
            '.ss2fa-tent{color:#95a5a6;font-size:.78rem;margin:0 0 20px}' +
            '.ss2fa-box label{display:block;text-align:left;font-size:.9rem;font-weight:600;margin-bottom:6px;color:#444}' +
            '.ss2fa-box input{width:100%;box-sizing:border-box;padding:11px 14px;border:1.5px solid #ddd;border-radius:7px;font-size:.95rem;outline:none;transition:border-color .2s;background:#fff;color:#2c3e50}' +
            '.ss2fa-box input:focus{border-color:#109ea3}' +
            '.ss2fa-btn{width:100%;border:none;border-radius:7px;padding:12px;font-size:.98rem;font-weight:700;cursor:pointer;margin-top:12px;transition:background .2s}' +
            '.ss2fa-ok{background:#109ea3;color:#fff}.ss2fa-ok:hover{background:#0d7a7e}' +
            '.ss2fa-cancel{background:#eef2f3;color:#587078;font-weight:600}.ss2fa-cancel:hover{background:#e0e7e9}' +
            'body.dark-mode .ss2fa-box{background:#1c2226;color:#e8edf0;border-top-color:#1ec2c7}' +
            'body.dark-mode .ss2fa-box h2{color:#1ec2c7}' +
            'body.dark-mode .ss2fa-sub{color:#9aa7ad}' +
            'body.dark-mode .ss2fa-box label{color:#c7d2d6}' +
            'body.dark-mode .ss2fa-box input{background:#20272c;color:#e8edf0;border-color:#313b42}' +
            'body.dark-mode .ss2fa-cancel{background:#2a3339;color:#c7d2d6}';
        document.head.appendChild(st);
    }

    function montarModal() {
        if (modal) return;
        injetarEstilos();
        modal = document.createElement('div');
        modal.className = 'ss2fa-overlay';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-labelledby', 'ss2fa-titulo');
        modal.innerHTML =
            '<div class="ss2fa-box">' +
                '<h2 id="ss2fa-titulo">🔐 Verificação de Segurança</h2>' +
                '<p class="ss2fa-sub">Responda a pergunta abaixo para confirmar sua identidade</p>' +
                '<p class="ss2fa-tent" id="ss2fa-tent"></p>' +
                '<label for="ss2fa-resp" id="ss2fa-pergunta"></label>' +
                '<input type="text" id="ss2fa-resp" autocomplete="off">' +
                '<button type="button" class="ss2fa-btn ss2fa-ok" id="ss2fa-confirmar">Confirmar</button>' +
                '<button type="button" class="ss2fa-btn ss2fa-cancel" id="ss2fa-cancelar">Voltar ao login</button>' +
            '</div>';
        document.body.appendChild(modal);

        document.getElementById('ss2fa-confirmar').addEventListener('click', responder);
        document.getElementById('ss2fa-cancelar').addEventListener('click', function () { encerrar(false); });
        document.getElementById('ss2fa-resp').addEventListener('keydown', function (e) {
            if (e.key === 'Enter') { e.preventDefault(); responder(); }
        });
        // Fechar com ESC = cancelar (não conta como tentativa nem gera log)
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && estado) encerrar(false);
        });
    }

    function atualizarTentativa() {
        document.getElementById('ss2fa-tent').textContent =
            'Tentativa ' + (estado.tentativas + 1) + ' de ' + MAX_TENTATIVAS;
    }

    function encerrar(sucesso) {
        var cb = estado ? estado.cb : {};
        modal.classList.remove('open');
        document.getElementById('ss2fa-resp').value = '';
        estado = null;
        if (sucesso) { if (cb.onSucesso) cb.onSucesso(); }
        else         { if (cb.onCancelar) cb.onCancelar(); }
    }

    function responder() {
        if (!estado) return;
        var campo = document.getElementById('ss2fa-resp');
        var correto = estado.conta[estado.pergunta.campo];

        if (confere(estado.pergunta, campo.value, correto)) {
            registrarLog(estado.conta, estado.tipo, estado.pergunta.label, 'sucesso');
            encerrar(true);
            return;
        }

        estado.tentativas++;
        if (estado.tentativas >= MAX_TENTATIVAS) {
            registrarLog(estado.conta, estado.tipo, estado.pergunta.label, 'falha');
            toast('error', 'Acesso bloqueado', '3 tentativas sem sucesso! Favor realizar o login novamente.');
            encerrar(false);
            return;
        }

        toast('warning', 'Resposta incorreta', 'Restam ' + (MAX_TENTATIVAS - estado.tentativas) + ' tentativa(s).');
        campo.value = '';
        campo.focus();
        atualizarTentativa();
    }

    // ── API pública ────────────────────────────────────────────
    function verificar(conta, tipo, cb) {
        cb = cb || {};
        // Só sorteia entre perguntas cujo dado existe no cadastro da conta.
        var disponiveis = PERGUNTAS.filter(function (p) {
            return String(conta[p.campo] == null ? '' : conta[p.campo]).trim() !== '';
        });

        // Contas padrão do sistema (acs1..acs5, admin) não têm esses dados:
        // entram sem 2FA, mas o acesso fica registrado no log.
        if (disponiveis.length === 0) {
            registrarLog(conta, tipo, 'Não aplicável (conta padrão)', 'sucesso');
            if (cb.onSucesso) cb.onSucesso();
            return;
        }

        montarModal();
        var pergunta = disponiveis[Math.floor(Math.random() * disponiveis.length)];
        estado = { conta: conta, tipo: tipo, pergunta: pergunta, tentativas: 0, cb: cb };

        document.getElementById('ss2fa-pergunta').textContent = pergunta.texto;
        var campo = document.getElementById('ss2fa-resp');
        campo.placeholder = pergunta.dica;
        campo.value = '';
        atualizarTentativa();
        modal.classList.add('open');
        setTimeout(function () { campo.focus(); }, 50);
    }

    window.SS2FA = {
        verificar: verificar,
        registrarLog: registrarLog,
        lerLogs: lerLogs,
        confere: confere,
        PERGUNTAS: PERGUNTAS
    };
})();
