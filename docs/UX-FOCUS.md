# Foco em UX/UI — Coleta Avaliação

> Documento vivo. Toda mudança visual nesta etapa deve respeitar estas diretrizes.
> Prioridade: **UX > UI > estética**.

## 1. Quem usa e onde

Avaliador em campo: **em pé, com o celular em uma mão**, atenção dividida entre
o imóvel e o aparelho, sessões de vários minutos. A interface deve funcionar em
**320px–430px** primeiro; desktop é a mesma coluna estreita centralizada.

## 2. Princípios inegociáveis

1. **Mínimo de digitação** — contador/stepper para quantidades, cards tocáveis
   para opções, teclado correto (`numeric`, `tel`, `date`, moeda com prefixo R$).
2. **Poucas decisões por tela** — uma seção = uma etapa; nunca uma tela por campo,
   nunca o formulário inteiro numa página.
3. **Toque grande e seguro** — alvos ≥ **48px** (ideal 56px), espaçamento entre
   alvos ≥ 8px, nav inferior fixa com `safe-area`.
4. **Orientação constante** — toda tela de coleta mostra: onde estou, quanto falta
   (`Etapa X de Y` + `%`), como voltar e como avançar.
5. **Nada se perde** — rascunho em `localStorage`, voltar preserva respostas,
   indicador visível de "Salvo ✓ HH:MM".
6. **Feedback em toda ação** — seleção, avanço, salvamento e conclusão têm resposta
   visual imediata (estado + microtransição ≤200ms). Sem animação decorativa.
7. **Nada depende só de cor** — selecionado = cor + ícone (✓/●) + borda + peso.

## 3. Sistema visual (identidade: engenharia precisa)

| Token | Valor | Uso |
|---|---|---|
| Fundo app | `#EDF0F4` | base |
| Superfície | `#FFFFFF` | cards |
| Tinta | `#0F1E33` | títulos/texto |
| Texto 2º | `#5B6B82` | hints, metadados |
| Primária | `#1D4ED8` (blue-700) | CTA, selecionado, progresso |
| Sucesso | `#15803D` | yes-sim, salvo, conclusão |
| Alerta | `#B45309` | rascunho, atenção |
| Raio | 16px cards / 12px inputs | — |
| Sombra | 1 nível, só em cards elevados/nav | sem sombras decorativas |

Proibido: gradientes, glassmorphism, >2 cores de destaque por tela, dashboard,
ícones aleatórios, dropdown para ≤7 opções, campos <48px.

## 4. Componentes (biblioteca própria — consistência obrigatória)

- **OptionCard** (tipo de imóvel): ícone + título + descrição, 76px+, estado
  selecionado e estado `disabled` ("Em breve").
- **RadioCard**: lista 1 coluna, radio-● à esquerda, selecionado = borda
  primária + fundo `blue-50` + texto `blue-950`.
- **CheckCard**: lista 1 coluna; **grade 2 colunas compacta quando todas as
  opções têm rótulo curto (≤24 chars)** — reduz rolagem sem quebrar legibilidade.
  Selecionado = ✓ + mesma linguagem do radio.
- **Stepper**: card único `− valor +`, botões 56px, input central numérico.
- **YesNo**: 2 botões segmentados, Sim=verde / Não=vermelho quando ativos.
- **Text/Number/Currency/Date/Tel/TextArea**: `min-h 56px`, borda 1.5px,
  `focus` = anel primário + borda primária, `font-size: 16px` (anti-zoom iOS).
- **BottomNav**: `Voltar` (fantasma) + `Continuar →` (primária, mostra o nome da
  próxima etapa quando couber); última seção = `Revisar →`.
- **SectionHeader**: eyebrow (`ETAPA X DE Y • Z%`), título 22px, descrição curta,
  barra de progresso fina.
- **ReviewCard**: só linhas preenchidas + contador `n/m` + botão Editar que volta
  exatamente à seção. Resumo no topo com anel de % concluído.
- **Estados**: `Salvando… → Salvo ✓`, retomar rascunho, vazio ("Nada preenchido"),
  conclusão com resumo (O.S. + seções).

## 5. Regras de dados (não quebrar)

- Fichas físicas = fonte de verdade de **campos, opções, nomenclatura e ordem**.
- Camada de dados (`src/forms/*` → `form-engine` → componentes) não muda por
  motivo visual. Casa entra como `src/forms/house.ts` + registro — zero refatoração.
- Sem backend nesta etapa: sem auth, sem banco, sem PDF.

## 6. Como testar no celular

1. `npm run dev -- --host` e abrir o IP da máquina no navegador do celular.
2. Percorrer Apartamento e Terreno completos **com uma mão, em pé**.
3. Checar em 320/375/390/430px (DevTools ou aparelhos reais).
4. Checklist: algum campo exigiu digitar o que podia ser toque? Algum alvo erra o
   dedo? O teclado aberto cobre a nav? Voltar perdeu algo? A revisão acha tudo em
   <10s? Teclado correto em número/telefone/data/moeda?
5. Build de produção: `npm run build` + `npm run preview -- --host`.
