# Contribuindo para o Modelo de Ameaças do OpenClaw

Obrigado por ajudar a tornar o OpenClaw mais seguro. Este modelo de ameaças é um documento vivo e aceitamos contribuições de qualquer pessoa — você não precisa ser um especialista em segurança.

## Formas de Contribuir

### Adicionar uma Ameaça

Encontrou um vetor de ataque ou risco que ainda não cobrimos? Abra uma issue em [openclaw/trust](https://github.com/openclaw/trust/issues) e descreva em suas próprias palavras. Você não precisa conhecer frameworks nem preencher todos os campos — apenas descreva o cenário.

**Útil incluir (mas não obrigatório):**

- O cenário de ataque e como ele poderia ser explorado
- Quais partes do OpenClaw são afetadas (CLI, gateway, canais, ClawHub, servidores MCP, etc.)
- O quão severo você acha que é (baixo / médio / alto / crítico)
- Quaisquer links para pesquisas relacionadas, CVEs ou exemplos do mundo real

Cuidaremos do mapeamento ATLAS, IDs de ameaça e avaliação de risco durante a revisão. Se quiser incluir esses detalhes, ótimo — mas não é esperado.

> **Isto é para adicionar ao modelo de ameaças, não para relatar vulnerabilidades ativas.** Se você encontrou uma vulnerabilidade explorável, veja nossa [Trust page](https://trust.openclaw.ai) para instruções de divulgação responsável.

### Sugerir uma Mitigação

Tem uma ideia de como lidar com uma ameaça existente? Abra uma issue ou PR referenciando a ameaça. Mitigações úteis são específicas e acionáveis — por exemplo, "limitação de taxa por remetente de 10 mensagens/minuto no gateway" é melhor do que "implementar limitação de taxa".

### Propor uma Cadeia de Ataque

Cadeias de ataque mostram como múltiplas ameaças se combinam em um cenário de ataque realista. Se você identificar uma combinação perigosa, descreva os passos e como um atacante as encadearia. Uma narrativa curta de como o ataque ocorre na prática é mais valiosa do que um template formal.

### Corrigir ou Melhorar Conteúdo Existente

Erros de digitação, esclarecimentos, informações desatualizadas, exemplos melhores — PRs são bem-vindos, não é necessário abrir uma issue.

## O que usamos

### MITRE ATLAS

Este modelo de ameaças é baseado no [MITRE ATLAS](https://atlas.mitre.org/) (Adversarial Threat Landscape for AI Systems), um framework projetado especificamente para ameaças de IA/ML como injeção de prompt, uso indevido de ferramentas e exploração de agentes. Você não precisa conhecer o ATLAS para contribuir — nós mapeamos as submissões ao framework durante a revisão.

### IDs de ameaças

Cada ameaça recebe um ID como `T-EXEC-003`. As categorias são:

| Código  | Categoria                                 |
| ------- | ----------------------------------------- |
| RECON   | Reconhecimento — coleta de informações    |
| ACCESS  | Acesso inicial — obtenção de entrada      |
| EXEC    | Execução — execução de ações maliciosas   |
| PERSIST | Persistência — manutenção de acesso       |
| EVADE   | Evasão de defesas — evitar detecção       |
| DISC    | Descoberta — aprendizado sobre o ambiente |
| EXFIL   | Exfiltração — roubo de dados              |
| IMPACT  | Impacto — dano ou interrupção             |

Os IDs são atribuídos pelos mantenedores durante a revisão. Você não precisa escolher um.

### Níveis de risco

| Nível       | Significado                                                               |
| ----------- | ------------------------------------------------------------------------- |
| **Crítico** | Comprometimento total do sistema, ou alta probabilidade + impacto crítico |
| **Alto**    | Danos significativos prováveis, ou probabilidade média + impacto crítico  |
| **Médio**   | Risco moderado, ou baixa probabilidade + alto impacto                     |
| **Baixo**   | Pouco provável e impacto limitado                                         |

Se você não tiver certeza sobre o nível de risco, apenas descreva o impacto e nós avaliaremos.

## Processo de revisão

1. **Triagem** — Revisamos novas submissões em até 48 horas
2. **Avaliação** — Verificamos a viabilidade, atribuímos o mapeamento ATLAS e o ID da ameaça, validamos o nível de risco
3. **Documentação** — Garantimos que tudo esteja formatado e completo
4. **Merge** — Adicionado ao modelo de ameaças e à visualização

## Recursos

- [Site do ATLAS](https://atlas.mitre.org/)
- [Técnicas do ATLAS](https://atlas.mitre.org/techniques/)
- [Estudos de caso do ATLAS](https://atlas.mitre.org/studies/)
- [Modelo de ameaças do OpenClaw](./THREAT-MODEL-ATLAS.md)

## Contato

- **Vulnerabilidades de segurança:** Consulte nossa [página de Trust](https://trust.openclaw.ai) para instruções de reporte
- **Perguntas sobre o modelo de ameaças:** Abra uma issue em [openclaw/trust](https://github.com/openclaw/trust/issues)
- 1. **Chat geral:** Canal #security do Discord

## 2. Reconhecimento

3. Os colaboradores do modelo de ameaças são reconhecidos nos agradecimentos do modelo de ameaças, nas notas de versão e no hall da fama de segurança do OpenClaw por contribuições significativas.
