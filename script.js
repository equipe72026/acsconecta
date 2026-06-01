let contadorMembros = 1;

function adicionarNovoCampo() {
    contadorMembros++;
    const container = document.getElementById("containerMembros");
    const novoMembro = document.createElement("div");
    novoMembro.classList.add("membro-bloco");
    
    novoMembro.innerHTML = `
        <h3>Membro ${contadorMembros}</h3>
        <div class="campo-item"><label>Nome Completo:</label><input type="text" class="casa" required></div>
        <div class="campo-item curto"><label>Nascimento:</label><input type="date" class="nascimento" required></div>
        <div class="campo-item curto"><label>Sexo:</label><select class="sexo"><option value="">Selecione</option><option value="M">Masculino</option><option value="F">Feminino</option></select></div>
        <div class="campo-item curto"><label>CPF:</label><input type="text" class="cpf" placeholder="000.000.000-00"></div>
        <div class="campo-item curto"><label>Celular:</label><input type="tel" class="celular" placeholder="(00) 00000-0000"></div>
        <div class="checkbox-group">
            <label class="check-item"><input type="checkbox" class="hipertenso"> Hipertenso</label>
            <label class="check-item"><input type="checkbox" class="diabetico"> Diabético</label>
            <label class="check-item"><input type="checkbox" class="prenatal"> Gestante</label>
            <label class="check-item"><input type="checkbox" class="vacina"> Vacina Atrasada</label>
        </div>
    `;
    container.appendChild(novoMembro);
}

function calcularIdade(dataNascimento) {
    if (!dataNascimento) return -1;
    const hoje = new Date();
    const nascimento = new Date(dataNascimento);
    let idade = hoje.getFullYear() - nascimento.getFullYear();
    const m = hoje.getMonth() - nascimento.getMonth();
    if (m < 0 || (m === 0 && hoje.getDate() < nascimento.getDate())) idade--;
    return idade;
}

function finalizarCadastro() {
    let totalGestantes = 0, totalHipertensos = 0, totalDiabeticos = 0, totalIdosos = 0, totalCriancas = 0;
    const listaAlertas = document.getElementById("alertas");
    listaAlertas.innerHTML = ""; 

    const blocos = document.querySelectorAll(".membro-bloco");
    
    blocos.forEach((bloco) => {
        const nome = bloco.querySelector(".casa").value || "Membro sem nome";
        const dataNasc = bloco.querySelector(".nascimento").value;
        const h = bloco.querySelector(".hipertenso").checked;
        const d = bloco.querySelector(".diabetico").checked;
        const v = bloco.querySelector(".vacina").checked;
        const g = bloco.querySelector(".prenatal").checked;

        const idade = calcularIdade(dataNasc);

        if (h) totalHipertensos++;
        if (d) totalDiabeticos++;
        if (g) totalGestantes++;
        if (idade >= 60) totalIdosos++;
        if (idade >= 0 && idade <= 12) totalCriancas++;

        if (v) {
            let li = document.createElement("li");
            li.innerText = `⚠️ ${nome} - Vacina atrasada`;
            listaAlertas.appendChild(li);
        }
    });

    // Atualiza o painel de resultados
    document.getElementById("res-visitas").innerText = blocos.length;
    document.getElementById("res-gestantes").innerText = totalGestantes;
    document.getElementById("res-hipertensos").innerText = totalHipertensos;
    document.getElementById("res-diabeticos").innerText = totalDiabeticos;
    document.getElementById("res-idosos").innerText = totalIdosos;
    document.getElementById("res-criancas").innerText = totalCriancas;

    alert("Dados da família salvos e processados com sucesso!");
}