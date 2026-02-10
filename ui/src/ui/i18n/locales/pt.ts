export const pt = {
  // Navigation
  navigation: {
    chat: "Chat",
    overview: "Visão Geral",
    channels: "Canais",
    instances: "Instâncias",
    sessions: "Sessões",
    usage: "Uso",
    cron: "Cron",
    skills: "Skills",
    nodes: "Nodes",
    agents: "Agentes",
    config: "Config",
    debug: "Debug",
    logs: "Logs",

    // Navigation Groups
    chatGroup: "Chat",
    controlGroup: "Controle",
    agentGroup: "Agente",
    settingsGroup: "Ajustes",

    // Resources
    resources: "Recursos",
    docs: "Docs",
    docsTitle: "Docs (nova aba)",
  },

  // Page titles and subtitles
  pageTitles: {
    agents: "Agentes",
    overview: "Visão Geral",
    channels: "Canais",
    instances: "Instâncias",
    sessions: "Sessões",
    usage: "Uso",
    cron: "Cron",
    skills: "Skills",
    nodes: "Nodes",
    chat: "Chat",
    config: "Config",
    debug: "Debug",
    logs: "Logs",
  },

  pageSubtitles: {
    agents: "Gerencie workspaces, ferramentas e identidades.",
    overview: "Status do gateway e saúde rápida.",
    channels: "Gerencie canais e configurações.",
    instances: "Beacons de clientes e nodes conectados.",
    sessions: "Sessões ativas e padrões.",
    usage: "",
    cron: "Agende tarefas e execuções.",
    skills: "Gerencie skills e chaves de API.",
    nodes: "Dispositivos pareados e capacidades.",
    chat: "Chat direto com o gateway.",
    config: "Edite o openclaw.json com segurança.",
    debug: "Snapshots, eventos e RPC manual.",
    logs: "Logs do gateway em tempo real.",
  },

  // Topbar
  topbar: {
    expandSidebar: "Expandir menu",
    collapseSidebar: "Recolher menu",
    brandTitle: "OPENCLAW",
    brandSubtitle: "Dashboard",
    health: "Health",
    offline: "Offline",
    ok: "OK",
    disconnected: "Desconectado do gateway.",
  },

  // Common UI elements
  common: {
    status: "Status",
    loading: "Carregando...",
    refresh: "Atualizar",
    save: "Salvar",
    cancel: "Cancelar",
    no: "Não",
    yes: "Sim",
    never: "Nunca",
    na: "N/D",
    unknown: "Desconhecido",
    none: "Nenhum",
    time: {
      inLessMinute: "Em menos de 1m",
      secondsAgo: "Há {{count}}s",
      minutesAgo: "Há {{count}}m",
      hoursAgo: "Há {{count}}h",
      daysAgo: "Há {{count}}d",
      inMinutes: "Em {{count}}m",
      inHours: "Em {{count}}h",
      inDays: "Em {{count}}d",
      seconds: "{{count}}s",
      minutes: "{{count}}m",
      hours: "{{count}}h",
      days: "{{count}}d",
    },
    apply: "Aplicar",
    close: "Fechar",
    ok: "OK",
    skipped: "Pulado",
    error: "Erro",
    clear: "Limpar",
    search: "Buscar",
    enabled: "Ativado",
    disabled: "Desativado",
    name: "Nome",
    all: "Tudo",
    valid: "Válido",
    invalid: "Inválido",
    conversation: "Conversa",
    noMessages: "Sem mensagens",
    roles: {
      user: "Você",
      assistant: "Assistente",
      tool: "Ferramenta",
      toolResult: "Resultado da ferramenta",
    },
    actions: "Ações",
    settings: "Config",
    edit: "Editar",
    delete: "Excluir",
    add: "Adicionar",
    remove: "Remover",
    connect: "Conectar",
    disconnect: "Desconectar",
    connected: "Conectado",
    disconnected: "Desconectado",
    active: "Ativo",
    current: "Atual",
    session: "Sessão",
    sessions: "Sessões",
  },

  // Chat
  chat: {
    compaction: {
      label: "Compactação",
      compacting: "Compactando contexto...",
      compacted: "Contexto compactado",
    },
    historyNotice: "Exibindo últimas {{count}} mensagens ({{hidden}} ocultas).",
    thinking: "Pensando",
    send: "Enviar",
    newSession: "Nova Sessão",
    focusMode: "Foco",
    showThinking: "Mostrar Raciocínio",
    noMessages: "Sem mensagens. Comece uma conversa!",
    attachment: "Anexo",
    attachments: "Anexos",
    placeholder: "Mensagem (↵ para enviar, Shift+↵ para quebra de linha, cole imagens)",
    placeholderWithAttachments: "Adicione uma mensagem ou cole mais imagens...",
    connectToChat: "Conecte-se ao gateway para iniciar o chat...",
    stop: "Parar",
    queue: "Enfileirar",
    newMessages: "Novas mensagens",
    loadingChat: "Carregando conversa…",
    messageLabel: "Mensagem",
    reasoningLabel: "Raciocínio:",
    toolCard: {
      completed: "Concluído",
      view: "Ver",
      noOutput: "Sem saída — ferramenta concluída com sucesso.",
    },
    queueTitle: "Na fila ({{count}})",
    removeQueuedMessage: "Remover mensagem da fila",
    imageAttachment: "Imagem ({{count}})",
    removeAttachment: "Remover anexo",
    attachmentPreview: "Prévia do anexo",
    exitFocusMode: "Sair do modo foco",
  },

  execApproval: {
    title: "Aprovação de execução necessária",
    expiresIn: "expira em {{time}}",
    expired: "expirado",
    pending: "{{count}} pendentes",
    hostLabel: "Host",
    agentLabel: "Agente",
    sessionLabel: "Sessão",
    cwdLabel: "CWD",
    resolvedLabel: "Resolvido",
    securityLabel: "Segurança",
    askLabel: "Perguntar",
    allowOnce: "Permitir uma vez",
    alwaysAllow: "Sempre permitir",
    deny: "Negar",
  },

  tools: {
    titles: {
      bash: "Terminal",
      read: "Ler",
      write: "Escrever",
      edit: "Editar",
      attach: "Anexar",
      browser: "Navegador",
      canvas: "Canvas",
      nodes: "Nodos",
      cron: "Cron",
      gateway: "Gateway",
      whatsapp_login: "Login do WhatsApp",
      discord: "Discord",
      slack: "Slack",
      exec: "Executar",
    },
  },
  usage: {
    agent: "Agente",
    channel: "Canal",
    provider: "Provedor",
    model: "Modelo",
    tool: "Ferramenta",
    filterHint:
      "Filtro (cliente): key:*, agent:*, channel:*, provider:*, model:*, tool:*, has:{tools|errors|context|usage|model|provider}, minTokens:N, maxCost:N",
    overview: "Visão Geral de Uso",
    activityByTime: "Atividade por Horário",
    dayOfWeek: "Dia da Semana",
    weekdaySun: "Dom",
    weekdayMon: "Seg",
    weekdayTue: "Ter",
    weekdayWed: "Qua",
    weekdayThu: "Qui",
    weekdayFri: "Sex",
    weekdaySat: "Sáb",
    hours: "Horas",
    dailyUsage: "Uso Diário",
    tokenUsage: "Uso de Tokens",
    costUsage: "Uso de Custo",
    byType: "Por Tipo",
    total: "Total",
    messages: "Mensagens",
    toolCalls: "Chamadas de Ferramenta",
    errorRate: "Taxa de Erro",
    throughput: "Taxa de Transferência",
    cacheHitRate: "Taxa de Hit de Cache",
    avgTokensPerMsg: "Média de Tokens / Msg",
    avgCostPerMsg: "Média de Custo / Msg",
    tokensByType: "Tokens por Tipo",
    costByType: "Custo por Tipo",
    sort: "Ordenar",
    recent: "Recente",
    cost: "Custo",
    errors: "Erros",
    all: "Tudo",
    recentlyViewed: "Visualizadas recentemente",
    noData: "Sem dados",
    midnight: "Meia-noite",
    noon: "Meio-dia",
    fourAm: "4h",
    eightAm: "8h",
    fourPm: "16h",
    eightPm: "20h",
    intensityHint: "Densidade de tokens: Baixa → Alta",
    timeZone: "Fuso horário",
    utc: "UTC",
    local: "Local",
    estimatesHint: "Estimativas requerem timestamps de sessão.",
    noTimeline: "Ainda não há dados na linha do tempo.",
    tokens: "Tokens",
    shown: "Exibido(s)",
    copy: "Copiar",
    clearSelection: "Limpar Seleção",
    descending: "Descendente",
    ascending: "Ascendente",
    sessionsShown: "Mostrando {{count}} sessões",
    totalSessionsSummary: "{{total}} total",
    noRecentSessions: "Nenhuma sessão recente.",
    copySessionName: "Copiar nome da sessão",
    noSessionsInRange: "Nenhuma sessão no intervalo",
    uniqueToolsUsed: "{{count}} ferramentas usadas",
    acrossMessages: "Em {{count}} mensagens",
    input: "Entrada",
    output: "Saída",
    cacheWrite: "Escrita de cache",
    cacheRead: "Leitura de cache",
    messagesHint: "Total de mensagens do usuário + assistente no intervalo.",
    toolCallsHint: "Contagem total de chamadas de ferramenta nas sessões.",
    errorsHint: "Total de erros de mensagem/ferramenta no intervalo.",
    sessionsHint: "Sessões distintas no intervalo.",
    cacheHitRateHint:
      "Taxa de hit de cache = leitura de cache / (entrada + leitura de cache). Quanto maior, melhor.",
    errorRateHint: "Taxa de erro = erros / total de mensagens. Quanto menor, melhor.",
    throughputHint:
      "A taxa de transferência mostra tokens por minuto durante o tempo ativo. Quanto maior, melhor.",
    avgTokensPerMsgHint: "Média de tokens por mensagem neste intervalo.",
    avgCostPerMsgHint: "Custo médio por mensagem quando os provedores relatam custos.",
    avgCostPerMsgMissingHint:
      "Custo médio por mensagem quando os provedores relatam custos. Faltam dados de custo para algumas ou todas as sessões neste intervalo.",
    usageTitle: "Uso",
    usageSubtitle:
      "Veja para onde vão os tokens, quando as sessões aumentam e o que impulsiona o custo.",
    filters: "Filtros",
    loading: "Carregando",
    queryHint: "Filtros de data no backend. Outros filtros aplicam-se à lista carregada abaixo.",
    export: "Exportar",
    to: "até",
    clear: "Limpar",
    pin: "Fixar",
    unpin: "Desafixar",
    pinned: "Fixado",
    pinFilters: "Fixar filtros no topo",
    unpinFilters: "Desafixar filtros",
    calls: "Chamadas",
    duration: "Duração",
    topTools: "Principais Ferramentas",
    modelMix: "Mix de Modelos",
    noModelData: "Sem dados de modelo",
    tools: "Ferramentas",
    toolNames: {
      edit: "Editar",
      exec: "Executar",
      read: "Ler",
      write: "Escrever",
      process: "Processar",
      browser: "Navegador",
      gateway: "Gateway",
      web_search: "Pesquisa web",
      list: "Listar",
      search: "Buscar",
      terminal: "Terminal",
      file: "Arquivo",
      unknown: "Desconhecido",
      web_fetch: "Acesso web",
      nodes: "Nodes",
      session_status: "Status da sessão",
      memory_search: "Busca na memória",
    },
    usageOverTime: "Uso ao Longo do Tempo",
    systemPromptBreakdown: "Detalhamento do Prompt do Sistema",
    noToolCalls: "Sem chamadas de ferramenta",
    toolsCount: "{{count}} ferramentas",
    toolResultsCount: "{{count}} resultados de ferramenta",
    perTurn: "Por Turno",
    cumulative: "Cumulativo",
    msgsCount: "{{count}} msgs",
    collapse: "Recolher",
    expandAll: "Expandir tudo",
    baseContextDesc: "Contexto base por mensagem",
    sysShort: "Sis",
    skills: "Skills",
    moreCount: "+{{count}} mais",
    noTimelineData: "Sem dados de linha do tempo",
    noDataInRange: "Sem dados no intervalo",
    noContextData: "Sem dados de contexto",
    noMessagesMatch: "Nenhuma mensagem corresponde aos filtros.",
    collapseAll: "Recolher Tudo",
    messagesCount: "{{count}} mensagens",
    channelShort: "ch",
    agentShort: "ag",
    providerShort: "pr",
    modelShort: "mo",
    msgsShort: "msgs",
    toolsShort: "ferr",
    errorsShort: "erros",
    durShort: "dur",
    allSessions: "Todas as sessões",
    selectAll: "Selecionar Tudo",
    clearAll: "Limpar Tudo",
    removeFilter: "Remover filtro",
    filterClientSide: "Filtrar (cliente)",
    sessionsMatch: "{{count}} de {{total}} sessões correspondem",
    sessionsInRange: "{{count}} sessões no intervalo",
    limitReached:
      "Mostrando as primeiras 1.000 sessões. Reduza o intervalo de datas para resultados completos.",
    daysCount: "{{count}} dias",
    hoursCount: "{{count}} horas",
    sessionsShortCount: "{{count}} sessões",
    today: "Hoje",
    last7d: "7d",
    last30d: "30d",
    startDateLabel: "Data Inicial",
    endDateLabel: "Data Final",
    exportSessionsCsv: "CSV de Sessões",
    exportDailyCsv: "CSV Diário",
    exportJson: "JSON",
    days: "Dias",
    userShort: "Usuário",
    assistantShort: "Assistente",
    totalSuffix: "Total",
    cachedLabel: "Cacheado",
    promptLabel: "Prompt",
    peakErrorDays: "Dias com Pico de Erros",
    peakErrorHours: "Horas com Pico de Erros",
    thinking: {
      title: "Raciocínio (Thinking)",
      description: "Configuração de raciocínio/pensamento.",
    },
    thinkingDefault: {
      title: "Raciocínio Padrão",
      description: "Nível padrão de cadeia de pensamento.",
    },
    topModels: "Principais Modelos",

    topProviders: "Principais Provedores",
    topAgents: "Principais Agentes",
    topChannels: "Principais Canais",
    noProviderData: "Sem dados de provedores",
    noAgentData: "Sem dados de agentes",
    noChannelData: "Sem dados de canais",
    noErrorData: "Sem dados de erros",
    avgSession: "Sessão média",
    filterPlaceholder:
      "Filtrar sessões (ex: key:agent:main:cron* model:gpt-4o has:errors minTokens:2000)",
    avgShort: "Méd",
    selectedCount: "Selecionado ({{count}})",
    unknownFilter: "Filtro desconhecido: {{key}}",
    missingValue: "Valor ausente para {{key}}",
    unknownHas: "Operador has desconhecido: {{value}}",
    invalidNumber: "Número inválido para {{key}}",
    toolsSummary: "Ferramentas: {{tools}} ({{count}} chamadas)",
    closeDetails: "Fechar detalhes da sessão",
    hasTools: "Com ferramentas",
    searchConversation: "Pesquisar conversa",
    messagesSubset: "{{count}} de {{total}}",
    tokensPerMin: "{{count}} tok/min",
    costPerMin: "{{cost}} / min",
    errorsCount: "{{count}} erros",
    msgsShortCount: "{{count}} msgs",
    ofInput: "~{{pct}}% da entrada",
    skillsWithCount: "Skills ({{count}})",
    toolsWithCount: "Ferramentas ({{count}})",
    filesWithCount: "Arquivos ({{count}})",
    files: "Arquivos",
    system: "Sistema",
  },

  // Gateway
  gateway: {
    changeUrl: "Alterar URL do Gateway",
    changeUrlSubtitle: "Isso irá reconectar a um servidor de gateway diferente",
    trustWarning:
      "Apenas confirme se você confia nesta URL. URLs maliciosas podem comprometer seu sistema.",
    confirm: "Confirmar",
  },

  // Settings
  settings: {
    theme: {
      light: "Claro",
      dark: "Escuro",
      system: "Auto",
      toggle: "Tema",
    },
    language: "Idioma",
    languageSelect: "Idioma",
  },

  // Channels
  channels: {
    logoutMessage: "Desconectado.",
    health: "Status dos canais",
    healthSubtitle: "Snapshots de status dos canais obtidos do gateway.",
    noSnapshot: "Nenhum snapshot ainda.",
    statusAndConfig: "Status e configuração do canal.",
    configured: "Configurado",
    running: "Executando",
    connected: "Conectado",
    lastInbound: "Última entrada",
    lastStart: "Último início",
    lastProbe: "Última sonda",
    probe: "Sondar",
    probeStatus: "Sonda {{status}} · {{message}}",
    mode: "Modo",
    modes: {
      polling: "Polling",
      webhook: "Webhook",
    },
    accounts: "Contas ({{count}})",
    groupPolicy: "Política de Grupo",
    streamMode: "Modo Stream",
    dmPolicy: "Política de DM",
    qrAlt: "Código QR",
    whatsapp: "WhatsApp",
    telegram: "Telegram",
    discord: "Discord",
    googlechat: "Google Chat",
    slack: "Slack",
    signal: "Signal",
    imessage: "iMessage",
    nostr: "Nostr",
  },

  whatsapp: {
    subtitle: "Vincule o WhatsApp Web e monitore a saúde da conexão.",
    linked: "Vinculado",
    lastConnect: "Última conexão",
    lastMessage: "Última mensagem",
    authAge: "Idade da autenticação",
    working: "Trabalhando...",
    showQr: "Mostrar QR",
    relink: "Vincular novamente",
    waitForScan: "Aguardar escaneamento",
    logout: "Sair",
  },

  telegram: {
    subtitle: "A maneira mais simples de começar — registre um bot com o @BotFather e comece.",
  },

  discord: {
    subtitle: "Status do bot e configuração do canal.",
  },

  googlechat: {
    subtitle: "Status do webhook da Chat API e configuração do canal.",
    credential: "Credencial",
    audience: "Audiência",
  },

  signal: {
    subtitle: "Status do signal-cli e configuração do canal.",
    baseUrl: "URL Base",
  },

  imessage: {
    subtitle: "Status do bridge macOS e configuração do canal.",
  },

  nostr: {
    subtitle: "DMs descentralizadas via relays Nostr (NIP-04).",
    publicKey: "Chave Pública",
    profile: "Perfil",
    editProfile: "Editar Perfil",
    noProfile:
      'Nenhum perfil definido. Clique em "Editar Perfil" para adicionar seu nome, bio e avatar.',
    account: "Conta: {{id}}",
    profilePicturePreview: "Prévia da foto de perfil",
    username: "Nome de usuário",
    usernamePlaceholder: "satoshi",
    usernameHelp: "Nome de usuário curto (ex: satoshi)",
    displayName: "Nome de Exibição",
    displayNamePlaceholder: "Satoshi Nakamoto",
    displayNameHelp: "Seu nome de exibição completo",
    bio: "Bio",
    bioPlaceholder: "Conte às pessoas sobre você...",
    bioHelp: "Uma breve biografia ou descrição",
    avatarUrl: "URL do Avatar",
    avatarUrlPlaceholder: "https://exemplo.com/avatar.jpg",
    avatarUrlHelp: "URL HTTPS para sua foto de perfil",
    advanced: "Avançado",
    bannerUrl: "URL do Banner",
    bannerUrlPlaceholder: "https://exemplo.com/banner.jpg",
    bannerUrlHelp: "URL HTTPS para uma imagem de banner",
    website: "Site",
    websitePlaceholder: "https://exemplo.com",
    websiteHelp: "Seu site pessoal",
    nip05: "Identificador NIP-05",
    nip05Placeholder: "voce@exemplo.com",
    nip05Help: "Identificador verificável (ex: voce@dominio.com)",
    lud16: "Endereço Lightning",
    lud16Placeholder: "voce@getalby.com",
    lud16Help: "Endereço Lightning para gorjetas (LUD-16)",
    saveAndPublish: "Salvar e Publicar",
    saving: "Salvando...",
    importFromRelays: "Importar de Relays",
    importing: "Importando...",
    showAdvanced: "Mostrar Avançado",
    hideAdvanced: "Ocultar Avançado",
    unsavedChanges: "Você tem alterações não salvas",
  },

  channelConfig: {
    saving: "Salvando...",
    save: "Salvar",
    reload: "Recarregar",
    loadingSchema: "Carregando esquema...",
    schemaUnavailable: "Esquema indisponível.",
    configUnavailable: "Esquema de configuração indisponível.",
  },

  // Config View
  config: {
    settings: "Configurações",
    allSettings: "Todas as Configurações",
    searchPlaceholder: "Buscar configurações...",
    unsavedChanges: "Alterações não salvas",
    unsavedChangesCount: "{{count}} alterações não salvas",
    noChanges: "Sem alterações",
    reload: "Recarregar",
    loading: "Carregando…",
    save: "Salvar",
    saving: "Salvando…",
    apply: "Aplicar",
    applying: "Aplicando…",
    all: "Tudo",
    update: "Atualizar",
    updating: "Atualizando…",
    viewPendingChanges: "Ver {{count}} alterações pendentes",
    formMode: "Formulário",
    rawMode: "Texto",
    rawJson5: "JSON5 Puro",
    loadingSchema: "Carregando esquema…",
    unsafeFormWarning:
      "A visualização de formulário não pode editar alguns campos com segurança. Use o modo Texto para evitar perder configurações.",
    sections: {
      env: "Variáveis de Ambiente",
      update: "Atualizações",
      agents: "Agentes",
      auth: "Autenticação",
      channels: "Canais",
      messages: "Mensagens",
      commands: "Comandos",
      hooks: "Hooks",
      skills: "Skills",
      tools: "Ferramentas",
      gateway: "Gateway",
      wizard: "Assistente de Configuração",
      meta: "Metadados",
      logging: "Logs",
      browser: "Navegador",
      ui: "Interface",
      models: "Modelos",
      bindings: "Atalhos",
      broadcast: "Transmissão",
      audio: "Áudio",
      session: "Sessão",
      cron: "Cron",
      web: "Web",
      discovery: "Descoberta",
      canvasHost: "Hospedagem de Canvas",
      talk: "Voz",
      plugins: "Plugins",
      diagnostics: "Diagnósticos",
      nodeHost: "Node Host",
      media: "Mídia",
      memory: "Memória",
      approvals: "Aprovações",
    },
    sectionDescriptions: {
      env: "Variáveis de ambiente passadas ao processo do gateway",
      update: "Configurações de auto-atualização e canal de lançamento",
      agents: "Configurações de agentes, modelos e identidades",
      auth: "Chaves de API e perfis de autenticação",
      channels: "Canais de mensagem (Telegram, Discord, Slack, etc.)",
      messages: "Configurações de manipulação e roteamento de mensagens",
      commands: "Comandos de barra personalizados",
      hooks: "Webhooks e ganchos de eventos",
      skills: "Pacotes de skills e capacidades",
      tools: "Configurações de ferramentas (navegador, busca, etc.)",
      gateway: "Configurações do servidor gateway (porta, autenticação, vínculo)",
      wizard: "Estado e histórico do assistente de configuração",
      meta: "Metadados do gateway e informações de versão",
      logging: "Níveis de log e configuração de saída",
      browser: "Configurações de automação do navegador",
      ui: "Preferências da interface do usuário",
      models: "Configurações de modelos IA e provedores",
      bindings: "Atalhos de teclado e combinações",
      broadcast: "Configurações de transmissão e notificações",
      audio: "Configurações de entrada/saída de áudio",
      session: "Gerenciamento de sessão e persistência",
      cron: "Tarefas agendadas e automação",
      web: "Configurações de servidor web e API",
      discovery: "Descoberta de serviços e rede",
      canvasHost: "Renderização e exibição de canvas",
      talk: "Configurações de voz e fala",
      plugins: "Gerenciamento de plugins e extensões",
      diagnostics: "Verificações de saúde e diagnóstico do sistema",
      nodeHost: "Configuração do host de node e proxy de navegador",
      media: "Processamento e armazenamento de mídia",
      memory: "Configurações de memória e armazenamento em cache",
      approvals: "Configurações de aprovação de execução de ferramentas e comandos",
    },
    schemaUnavailable: "Esquema indisponível.",
    unsupportedSchema: "Esquema não suportado. Use Texto Puro.",
    noSettingsMatch: 'Nenhuma configuração corresponde a "{{query}}"',
    noSettingsInSection: "Nenhuma configuração nesta seção",
    enumValues: {
      ack: "Confirmação (Ack)",
      all: "Todos",
      allow: "Permitir",
      allowlist: "Lista de Permissão (Allowlist)",
      always: "Sempre",
      announce: "Anunciar",
      "anthropic-messages": "Mensagens Anthropic",
      "api-key": "Chave de API",
      "app-url": "URL do App",
      archive: "Arquivo",
      arg: "Argumento de CLI",
      audio: "Áudio",
      auto: "Automático",
      "aws-sdk": "AWS SDK",
      "bedrock-converse-stream": "Stream de Conversa Bedrock (Bedrock Converse)",
      beta: "Beta",
      block: "Bloquear",
      blocklist: "Lista de Bloqueio (Blocklist)",
      browsers: "Navegadores",
      builtin: "Integrado",
      bullets: "Marcadores",
      bun: "Bun",
      channel: "Canal",
      clawd: "Clawd",
      closed: "Fechado",
      code: "Código",
      collect: "Coletar",
      compact: "Compacto",
      custom: "Personalizado",
      daily: "Diário",
      debug: "Depuração (Debug)",
      default: "Padrão",
      dev: "Desenvolvimento (Dev)",
      direct: "Direto (DM)",
      disabled: "Desativado",
      dm: "DM (Mensagem Direta)",
      edge: "Edge",
      efficient: "Eficiente",
      elevenlabs: "ElevenLabs",
      enabled: "Habilitado",
      error: "Erro",
      existing: "Existente",
      extensive: "Extensivo",
      extension: "Extensão",
      false: "Falso",
      fatal: "Fatal",
      final: "Final",
      first: "Primeiro",
      followup: "Acompanhamento",
      full: "Completo",
      funnel: "Funil (Tailscale Funnel)",
      "github-copilot": "GitHub Copilot",
      "google-generative-ai": "Google Gemini",
      group: "Grupo",
      "group-all": "Todos do Grupo",
      "group-mentions": "Menções em Grupo",
      grpc: "gRPC",
      hot: "Quente (Hot Reload)",
      "http/protobuf": "HTTP/Protobuf",
      http: "HTTP",
      hybrid: "Híbrido",
      idle: "Ocioso",
      ignore: "Ignorar",
      image: "Imagem",
      imessage: "iMessage",
      inbound: "Entrada",
      info: "Informação (Info)",
      instant: "Instantâneo",
      interrupt: "Interromper",
      isolated: "Isolado",
      json: "JSON",
      jsonl: "JSONL",
      lan: "LAN",
      last: "Último",
      length: "Comprimento",
      list: "Lista",
      local: "Local",
      logs: "Logs",
      loopback: "Loopback",
      main: "Principal",
      manual: "Manual",
      message: "Mensagem",
      minimal: "Mínimo",
      natural: "Natural",
      never: "Nunca",
      new: "Novo",
      newline: "Nova Linha",
      "next-heartbeat": "Próximo Batimento (Heartbeat)",
      no: "Não",
      none: "Nenhum",
      now: "Agora",
      npm: "NPM",
      oauth: "OAuth",
      off: "Desligado",
      old: "Antigo",
      on: "Ligado",
      open: "Aberto",
      "openai-completions": "OpenAI Completions",
      "openai-responses": "OpenAI Responses",
      own: "Próprio",
      pairing: "Pareamento",
      paragraph: "Parágrafo",
      partial: "Parcial",
      password: "Senha",
      path: "Caminho",
      "per-account-channel-peer": "Por Conta, Canal e Par",
      "per-channel-peer": "Por Canal e Par",
      "per-peer": "Por Par (Peer)",
      "per-sender": "Por Remetente",
      pnpm: "PNPM",
      polling: "Sondagem (Polling)",
      pretty: "Formatado (Pretty)",
      "project-number": "Número de Projeto",
      provider: "Provedor",
      qmd: "QMD",
      queue: "Fila",
      quote: "Citar",
      reaction: "Reação",
      remote: "Remoto",
      repeat: "Repetir",
      replace: "Substituir",
      reply: "Responder",
      restart: "Reiniciar",
      sentence: "Frase",
      safeguard: "Salvaguarda",
      serve: "Servir (Serve)",
      silent: "Silencioso",
      sms: "SMS",
      socket: "Socket",
      ssh: "SSH",
      stable: "Estável",
      stdin: "STDIN",
      steer: "Direcionar (Steer)",
      "steer+backlog": "Direcionar + Backlog",
      "steer-backlog": "Direcionar (Backlog)",
      summarize: "Resumir",
      tables: "Tabelas",
      tagged: "Marcado",
      tailnet: "Tailnet",
      text: "Texto",
      thinking: "Pensando",
      thread: "Thread (Tópico)",
      token: "Token",
      tools: "Ferramentas",
      "top-level": "Nível Superior",
      trace: "Rastreamento",
      true: "Verdadeiro",
      url: "URL",
      text_end: "Fim do Texto",
      message_end: "Fim da Mensagem",
      "cache-ttl": "Tempo de Vida do Cache (TTL)",
      ask: "Perguntar",
      video: "Vídeo",
      "non-main": "Apenas Secundários",
      ro: "Somente Leitura (RO)",
      rw: "Leitura e Escrita (RW)",
      spawned: "Apenas Criadas (Spawned)",
      shared: "Compartilhado",
      sandbox: "Sandbox",
      warn: "Aviso (Warn)",
      "on-miss": "Se Faltar (On-miss)",
      webhook: "Webhook",
      xhigh: "Muito Alto",
      XHigh: "Muito Alto",
      high: "Alto",
      High: "Alto",
      medium: "Médio",
      Medium: "Médio",
      low: "Baixo",
      Low: "Baixo",
      yarn: "Yarn",
      yes: "Sim",
    },
    path: {
      thinkingDefault: {
        title: "Racio. Padrão (Thinking)",
        description: "Nível padrão de raciocínio.",
      },
      thinking: { title: "Racio. Padrão (Thinking)", description: "Nível padrão de raciocínio." },
      common: {
        defaults: { title: "Padrões", description: "Configurações padrão." },
        list: { title: "Lista", description: "Itens configurados individualmente." },
        enabled: { title: "Habilitado", description: "Se esta seção ou recurso deve estar ativo." },
        disabled: {
          title: "Desativado",
          description: "Se esta seção ou recurso deve ser ignorado.",
        },
        name: { title: "Nome", description: "Nome de exibição para este item." },
        botToken: { title: "Token do Bot", description: "Token de autenticação para o bot." },
        appToken: {
          title: "Token do App",
          description: "Token de autenticação para o aplicativo.",
        },
        dmPolicy: { title: "Política de DM", description: "Como lidar com mensagens diretas." },
        groupPolicy: {
          title: "Política de Grupo",
          description: "Como lidar com mensagens em grupo.",
        },
        allowFrom: { title: "Permitir De", description: "Lista de IDs permitidos." },
        groupAllowFrom: {
          title: "Permitir De (Grupo)",
          description: "Lista de IDs de grupo permitidos.",
        },
        retry: {
          title: "Reexecução",
          description: "Configurações de tentativa em caso de falha.",
          attempts: { title: "Tentativas", description: "Número máximo de tentativas." },
          minDelayMs: {
            title: "Atraso Mínimo (ms)",
            description: "Espera mínima entre tentativas.",
          },
          maxDelayMs: {
            title: "Atraso Máximo (ms)",
            description: "Espera máxima entre tentativas.",
          },
          jitter: { title: "Jitter", description: "Fator de aleatoriedade no atraso." },
        },
        configWrites: {
          title: "Gravação de Configuração",
          description: "Permite persistir alterações feitas via chat.",
        },
        commands: {
          title: "Comandos",
          description: "Configuração de comandos de barra e automação.",
          native: { title: "Nativo", description: "Comandos internos do sistema." },
          nativeSkills: { title: "Skills Nativas", description: "Comandos de skills integrados." },
        },
        actions: {
          title: "Ações",
          description: "Permissões de ações para este canal.",
          deleteMessage: {
            title: "Excluir Mensagem",
            description: "Permissão para excluir mensagens.",
          },
          sendMessage: {
            title: "Enviar Mensagem",
            description: "Permissão para enviar mensagens.",
          },
          reactions: { title: "Reações", description: "Permissão para adicionar reações." },
          sticker: {
            title: "Figurinha (Sticker)",
            description: "Permissão para enviar figurinha.",
          },
          stickers: {
            title: "Figurinhas (Stickers)",
            description: "Permissão para enviar figurinhas.",
          },
        },
        proxy: { title: "Proxy", description: "URL do servidor proxy." },
        timeoutSeconds: { title: "Tempo Limite (segundos)", description: "Timeout para a API." },
        accountId: { title: "ID da Conta", description: "Identificador da conta." },
        ackMaxChars: {
          title: "Máximo de Caracteres Ack",
          description: "Limite de caracteres para mensagens de confirmação.",
        },
        activeHours: {
          title: "Horário de Atividade",
          description: "Define quando está ativo.",
          start: { title: "Início", description: "Hora de início (formato HH:MM)." },
          end: { title: "Fim", description: "Hora de término (formato HH:MM)." },
          timezone: {
            title: "Fuso Horário",
            description: "Fuso horário para o horário de atividade.",
          },
        },
        model: { title: "Modelo", description: "Modelo de IA a usar." },
        session: { title: "Sessão", description: "Configuração de sessão." },
        includeReasoning: {
          title: "Incluir Raciocínio",
          description: "Incluir cadeia de pensamento nas respostas.",
        },
        target: { title: "Alvo", description: "Alvo de entrega." },
        to: { title: "Para", description: "Destinatário da mensagem." },
        prompt: { title: "Prompt", description: "Instrução ou mensagem inicial." },
        every: { title: "Frequência", description: "Intervalo de execução (ex: 5m, 1h)." },
        historyLimit: {
          title: "Limite de Histórico",
          description: "Mensagens mantidas no contexto.",
        },
        api: { title: "API", description: "Tipo de API do modelo." },
        cost: { title: "Custo", description: "Configuração de custos do modelo." },
        input: { title: "Entrada", description: "Custo ou configuração de entrada." },
        output: { title: "Saída", description: "Custo ou configuração de saída." },
        contextWindow: {
          title: "Janela de Contexto",
          description: "Tamanho da janela de contexto do modelo.",
        },
        maxTokens: {
          title: "Máximo de Tokens",
          description: "Limite máximo de tokens na resposta.",
        },
        headers: { title: "Cabeçalhos", description: "Cabeçalhos HTTP adicionais." },
        compat: { title: "Compatibilidade", description: "Opções de compatibilidade." },
        auth: { title: "Autenticação", description: "Método de autenticação." },
        region: { title: "Região", description: "Região do serviço (ex: us-east-1)." },
        queue: { title: "Fila", description: "Configuração de fila de mensagens." },
        command: { title: "Comando", description: "Comando executável." },
        args: { title: "Argumentos", description: "Argumentos do comando." },
        env: { title: "Variáveis de Ambiente", description: "Variáveis de ambiente adicionais." },
        providers: { title: "Provedores", description: "Provedores de serviço configurados." },
        alias: { title: "Alias", description: "Nome alternativo ou apelido." },
        params: { title: "Parâmetros", description: "Parâmetros adicionais de configuração." },
        streaming: { title: "Streaming", description: "Habilitar streaming de respostas." },
        compaction: { title: "Compactação", description: "Estratégia de compactação de contexto." },
        reserveTokensFloor: {
          title: "Piso de Reserva de Tokens",
          description: "Mínimo de tokens reservados.",
        },
        maxHistoryShare: {
          title: "Parcela Máxima de Histórico",
          description: "Proporção máxima do contexto para histórico.",
        },
        memoryFlush: {
          title: "Descarga de Memória",
          description: "Configuração de limpeza de memória.",
        },
        softThresholdTokens: {
          title: "Limite Flexível de Tokens",
          description: "Limite para iniciar descarga suave.",
        },
        skipBootstrap: {
          title: "Pular Inicialização",
          description: "Não carregar instruções iniciais.",
        },
        timeFormat: { title: "Formato de Hora", description: "Formato de exibição de hora." },
        thinkingLevel: {
          title: "Nível de Pensamento",
          description: "Nível de detalhamento do raciocínio.",
        },
        thinking_level: {
          title: "Nível de Pensamento",
          description: "Nível de detalhamento do raciocínio.",
        },
        thinkingDefault: {
          title: "Racio. Padrão (Thinking)",
          description: "Nível padrão de raciocínio.",
        },
        chatThinkingLevel: {
          title: "Nível de Pensamento (Chat)",
          description: "Nível de pensamento.",
        },
        thinking: { title: "Racio. Padrão (Thinking)", description: "Nível padrão de raciocínio." },
        thinking_default: {
          title: "Racio. Padrão (Thinking)",
          description: "Nível padrão de raciocínio.",
        },
        envelope: { title: "Envelope", description: "Metadados da mensagem." },
        pruning: {
          title: "Poda de Contexto",
          description: "Estratégia de remoção de mensagens antigas.",
        },
        ttl: { title: "TTL (Tempo de Vida)", description: "Tempo até expiração." },
        keepLastAssistants: {
          title: "Manter Últimos Assistentes",
          description: "Preservar últimas respostas.",
        },
        textChunkLimit: {
          title: "Limite de Fragmento de Texto",
          description: "Tamanho máximo por mensagem.",
        },
        apiKey: { title: "Chave de API", description: "Chave de autenticação para o provedor." },
        baseUrl: { title: "URL Base", description: "URL base para requisições de API." },
        timeoutMs: { title: "Tempo Limite (ms)", description: "Timeout em milissegundos." },
        theme: { title: "Tema", description: "Tema visual da identidade." },
        avatar: { title: "Avatar", description: "URL ou caminho do avatar." },
        image: { title: "Imagem", description: "Processamento de imagem." },
        audio: { title: "Áudio", description: "Processamento de áudio." },
        video: { title: "Vídeo", description: "Processamento de vídeo." },
        maxLinks: {
          title: "Máximo de Links",
          description: "Quantidade máxima de links a processar.",
        },
        skills: { title: "Skills", description: "Habilidades habilitadas." },
        blockStreaming: {
          title: "Bloquear Streaming",
          description: "Desabilitar streaming de mensagens.",
        },
        blockStreamingCoalesce: {
          title: "Coalescência de Streaming",
          description: "Configurações de agrupamento de mensagens.",
          idleMs: { title: "Tempo Ocioso (ms)", description: "Tempo de espera antes de agrupar." },
          maxChars: {
            title: "Máximo de Caracteres",
            description: "Limite de caracteres por grupo.",
          },
        },
        linkPreview: { title: "Prévia de Link", description: "Mostrar prévias de links." },
        responsePrefix: {
          title: "Prefixo de Resposta",
          description: "Prefixo para respostas do bot.",
        },
        replyToMode: { title: "Modo de Resposta", description: "Como responder às mensagens." },
        mediaMaxMb: {
          title: "Máximo de MB de Mídia",
          description: "Tamanho máximo de mídia em MB.",
        },
        selfChatMode: {
          title: "Modo de Chat Próprio",
          description: "Como lidar com mensagens do próprio número.",
        },
        debounceMs: {
          title: "Debounce (ms)",
          description: "Tempo de espera para agrupar mensagens.",
        },
        accounts: { title: "Contas", description: "Contas configuradas para este canal." },
        draftChunk: {
          title: "Fragmento de Rascunho",
          description: "Configurações de fragmentação de mensagens em rascunho.",
          breakPreference: {
            title: "Preferência de Quebra",
            description:
              "Pontos de quebra preferidos para fragmentos (parágrafo | nova linha | frase). Padrão: parágrafo.",
          },
          maxChars: {
            title: "Máximo de Caracteres",
            description: "Tamanho máximo de um fragmento de rascunho (padrão: 800).",
          },
          minChars: {
            title: "Mínimo de Caracteres",
            description: "Mínimo de caracteres antes de emitir uma atualização (padrão: 200).",
          },
        },
        heartbeat: {
          title: "Heartbeat",
          description: "Configurações de monitoramento de heartbeat.",
          showAlerts: { title: "Mostrar Alertas", description: "Exibir alertas de heartbeat." },
          showOk: { title: "Mostrar OK", description: "Exibir status de heartbeat OK." },
          useIndicator: {
            title: "Usar Indicador",
            description: "Exibir indicador visual de heartbeat.",
          },
        },
        showAlerts: { title: "Mostrar Alertas", description: "Exibir alertas." },
        showOk: { title: "Mostrar OK", description: "Exibir status OK." },
        useIndicator: { title: "Usar Indicador", description: "Usar indicador visual." },
        // Custom commands and chunk settings
        customCommands: {
          title: "Comandos Personalizados",
          description: "Comandos personalizados para este canal.",
        },
        chunkMode: {
          title: "Modo de Fragmentação",
          description: "Como fragmentar mensagens longas.",
          length: { title: "Comprimento", description: "Comprimento máximo do fragmento." },
          minChars: {
            title: "Mínimo de Caracteres",
            description: "Mínimo de caracteres por fragmento.",
          },
          tables: { title: "Tabelas", description: "Preservar tabelas inteiras." },
          bullets: { title: "Marcadores", description: "Preservar listas com marcadores." },
          code: { title: "Código", description: "Preservar blocos de código." },
        },
        length: { title: "Comprimento", description: "Comprimento do valor." },
        minChars: { title: "Mínimo de Caracteres", description: "Mínimo de caracteres." },
        tables: { title: "Tabelas", description: "Configuração de tabelas." },
        bullets: { title: "Marcadores", description: "Configuração de marcadores." },
        code: { title: "Código", description: "Configuração de código." },
        // Network settings
        network: {
          title: "Rede",
          description: "Configurações de rede.",
          autoSelectFamily: {
            title: "Auto-Seleção de Família",
            description: "Seleção automática de família de IP (IPv4/IPv6).",
          },
        },
        autoSelectFamily: {
          title: "Auto-Seleção de Família",
          description: "Substituir autoSelectFamily do Node (true=habilitar, false=desabilitar).",
        },
        // Reaction settings
        reactionLevel: { title: "Nível de Reação", description: "Nível de detalhes das reações." },
        reactionNotifications: {
          title: "Notificações de Reação",
          description: "Notificações para reações.",
        },
        // Webhook settings
        webhookPath: { title: "Caminho do Webhook", description: "Caminho da URL do webhook." },
        webhookSecret: {
          title: "Segredo do Webhook",
          description: "Segredo para validação do webhook.",
        },
        webhookUrl: { title: "URL do Webhook", description: "URL completa do webhook." },
        // Other settings
        tokenFile: { title: "Arquivo de Token", description: "Caminho para o arquivo de token." },
        first: { title: "Primeiro", description: "Configuração inicial." },
        // Capabilities and features
        capabilities: { title: "Capacidades", description: "Recursos e capacidades disponíveis." },
        dmHistoryLimit: {
          title: "Limite de Histórico de DM",
          description: "Limite de mensagens no histórico de conversas diretas.",
        },
        groups: { title: "Grupos", description: "Configurações de grupos." },
        requireMention: { title: "Requer Menção", description: "Exigir menção para responder." },
        systemPrompt: {
          title: "Prompt de Sistema",
          description: "Prompt de sistema personalizado.",
        },
        // Tools settings
        tools: {
          title: "Ferramentas",
          description: "Configurações de ferramentas.",
          allow: { title: "Permitir", description: "Ferramentas permitidas." },
          alsoAllow: {
            title: "Também Permitir",
            description: "Ferramentas adicionais permitidas.",
          },
          deny: { title: "Negar", description: "Ferramentas negadas." },
        },
        allow: { title: "Permitir", description: "Itens permitidos." },
        alsoAllow: { title: "Também Permitir", description: "Itens adicionais permitidos." },
        deny: { title: "Negar", description: "Itens negados." },
        toolsBySender: {
          title: "Ferramentas por Remetente",
          description: "Configurações de ferramentas por remetente.",
        },
        topics: { title: "Tópicos", description: "Configurações de tópicos." },
        ulimits: {
          title: "Limites de Recursos (Ulimits)",
          description: "Limites de recursos para o ambiente de execução.",
        },
        seccompProfile: {
          title: "Perfil Seccomp",
          description: "Perfil seccomp personalizado para segurança do container.",
        },
        apparmorProfile: {
          title: "Perfil Apparmor",
          description: "Perfil AppArmor personalizado para segurança do container.",
        },
        pidsLimit: {
          title: "Limite de PIDs",
          description: "Número máximo de processos permitidos dentro do container.",
        },
        memory: {
          title: "Memória",
          description: "Limite de memória para o container de execução (ex: 1g).",
        },
        memorySwap: {
          title: "Swap de Memória",
          description: "Limite de swap para o container de execução.",
        },
        vncPort: { title: "Porta VNC", description: "Porta para acesso remoto via desktop VNC." },
        noVncPort: { title: "Porta noVNC", description: "Porta para acesso via web noVNC." },
        enableNoVnc: {
          title: "Habilitar noVNC",
          description: "Habilitar acesso ao navegador via interface web (noVNC).",
        },
        autoStartTimeoutMs: {
          title: "Tempo Limite de Início Automático (ms)",
          description: "Tempo limite para o início automático do serviço.",
        },
        allowHostControl: {
          title: "Permitir Controle do Host",
          description: "Permitir que o container controle aspectos do host.",
        },
        models: {
          title: "Modelos",
          description:
            "Catálogo de modelos configurados (chaves são IDs completos de provedor/modelo).",
        },
        watchDebounceMs: {
          title: "Debounce de Observação (ms)",
          description: "Tempo de espera para atualizações na observação de arquivos de memória.",
        },
        watch: {
          title: "Observar Arquivos de Memória",
          description: "Observar alterações em arquivos de memória (chokidar).",
        },
        sessionDeltaMessages: {
          title: "Mensagens Delta de Sessão",
          description:
            "Mínimo de linhas JSONL anexadas antes que transcrições disparem reindexação (padrão: 50).",
        },
        sessionDeltaBytes: {
          title: "Bytes Delta de Sessão",
          description:
            "Mínimo de bytes anexados antes que transcrições disparem reindexação (padrão: 100000).",
        },
        sessions: { title: "Sessões", description: "Configuração de indexação de sessões." },
        indexOnSessionStart: {
          title: "Indexar ao Iniciar Sessão",
          description: "Iniciar indexação quando uma sessão começar.",
        },
        lazySync: {
          title: "Indexar na Busca (Lazy)",
          description: "Sincronização preguiçosa: agendar reindexação na busca após alterações.",
        },
        sync: {
          title: "Sincronização",
          description: "Configurações de sincronização para atualizações de dados.",
        },
        intervalMinutes: {
          title: "Intervalo (Minutos)",
          description: "Intervalo de tempo em minutos entre sincronizações.",
        },
        vectorExtensionPath: {
          title: "Caminho da Extensão de Vetor",
          description:
            "Caminho opcional para a biblioteca de extensão sqlite-vec (.dylib/.so/.dll).",
        },
        hybrid: {
          title: "Híbrido",
          description: "Configuração de busca híbrida combinando vetor e texto.",
        },
        maxResults: {
          title: "Máximo de Resultados",
          description: "Número máximo de resultados a retornar.",
        },
        minScore: {
          title: "Pontuação Mínima",
          description: "Pontuação mínima de relevância (0.0 a 1.0).",
        },
      },
      env: {
        shellEnv: {
          title: "Ambiente do Shell",
          description: "Configuração do ambiente de shell para execução de comandos.",
          enabled: { title: "Habilitado", description: "Se o ambiente de shell está habilitado." },
          timeoutMs: {
            title: "Tempo Limite (ms)",
            description: "Tempo limite para inicialização do shell em milissegundos.",
          },
        },
        vars: {
          title: "Variáveis",
          description: "Variáveis de ambiente passadas ao processo do gateway.",
        },
      },
      meta: {
        lastTouchedVersion: {
          title: "Versão da Última Alteração",
          description: "Versão do OpenClaw que modificou a configuração pela última vez.",
        },
        lastTouchedAt: {
          title: "Data da Última Alteração",
          description: "Carimbo de data/hora da última atualização da configuração.",
        },
      },
      wizard: {
        lastRunAt: {
          title: "Última Execução",
          description: "Data/hora da última execução do assistente de configuração.",
        },
        lastRunVersion: {
          title: "Versão da Última Execução",
          description: "Versão do assistente de configuração utilizada na última execução.",
        },
        lastRunCommit: {
          title: "Commit da Última Execução",
          description: "Hash do commit registrado durante a última execução do assistente.",
        },
        lastRunCommand: {
          title: "Comando da Última Execução",
          description: "Comando final executado pelo assistente de configuração.",
        },
        lastRunMode: {
          title: "Modo da Última Execução",
          description: "Modo de execução da última sessão do assistente.",
        },
      },
      update: {
        channel: {
          title: "Canal de Atualização",
          description: 'Canal para atualizações ("estável", "beta" ou "desenvolvimento").',
        },
        checkOnStart: {
          title: "Verificar ao Iniciar",
          description: "Verificar atualizações ao iniciar.",
        },
      },
      commands: {
        native: {
          title: "Comandos Nativos",
          description: "Configuração para comandos nativos do sistema.",
        },
        nativeSkills: {
          title: "Skills Nativas",
          description: "Comandos fornecidos por módulos de habilidades nativas.",
        },
        text: {
          title: "Comandos de Texto",
          description: "Configuração para comandos baseados em texto.",
        },
        bash: {
          title: "Comando Bash (!)",
          description: "Habilitar ou configurar a execução direta de comandos bash.",
        },
        bashForegroundMs: {
          title: "Janela do Bash (ms)",
          description: "Duração para manter o terminal bash em primeiro plano.",
        },
        config: { title: "Permitir /config", description: "Habilitar o comando de barra /config." },
        debug: { title: "Permitir /debug", description: "Habilitar o comando de barra /debug." },
        restart: {
          title: "Permitir Reinício",
          description: "Habilitar o comando /restart para o gateway.",
        },
        useAccessGroups: {
          title: "Usar Grupos de Acesso",
          description: "Habilitar grupos de acesso para permissões de comando.",
        },
        ownerAllowFrom: {
          title: "Proprietários",
          description:
            "Lista de permissões para usuários autorizados a usar comandos de proprietário.",
        },
      },
      hooks: {
        enabled: {
          title: "Ganchos Habilitados",
          description: "Interruptor global para habilitar ou desabilitar integrações via webhook.",
        },
        path: {
          title: "Caminho dos Ganchos",
          description: "Caminho da URL onde o gateway escuta por ganchos (webhooks) de entrada.",
        },
        token: {
          title: "Token do Gancho",
          description: "Token de segurança necessário para autenticar webhooks de entrada.",
        },
        maxBodyBytes: {
          title: "Máximo de Bytes de Corpo",
          description: "Limite de tamanho máximo para o corpo das requisições de webhook.",
        },
        presets: {
          title: "Predefinições (Presets)",
          description: "Configurações nomeadas para padrões comuns de webhooks.",
        },
        transformsDir: {
          title: "Diretório de Transformações",
          description: "Caminho para arquivos JavaScript de transformação personalizada de hooks.",
        },
        mappings: {
          title: "Mapeamentos",
          description:
            "Regras para mapear cargas úteis de entrada para ações específicas do agente.",
        },
        gmail: {
          title: "Ganchos Gmail",
          description: "Configuração para notificações push do Google Gmail.",
        },
        internal: {
          title: "Ganchos Internos",
          description: "Configuração para ganchos gerados por módulos internos.",
        },
      },
      diagnostics: {
        enabled: {
          title: "Diagnósticos Ativados",
          description: "Habilitar diagnósticos internos e rastreamento.",
        },
        flags: {
          title: "Sinalizadores de Diagnóstico",
          description: 'Sinalizadores para depuração específica (ex: ["telegram.http"]).',
        },
        otel: {
          title: "OpenTelemetry",
          description: "Exportar dados de telemetria via protocolo OpenTelemetry.",
          enabled: {
            title: "Habilitar OpenTelemetry",
            description: "Habilitar exportação de telemetria via OpenTelemetry.",
          },
          endpoint: {
            title: "Endpoint OpenTelemetry",
            description: "URL do coletor OpenTelemetry (ex: http://localhost:4318).",
          },
          protocol: {
            title: "Protocolo OpenTelemetry",
            description: "Protocolo de transporte para OpenTelemetry.",
          },
          headers: {
            title: "Cabeçalhos OpenTelemetry",
            description: "Cabeçalhos HTTP adicionais para autenticação no coletor.",
          },
          serviceName: {
            title: "Nome do Serviço OpenTelemetry",
            description: "Nome do serviço para identificação na telemetria.",
          },
          traces: {
            title: "Rastreamento OpenTelemetry Habilitado",
            description: "Habilitar exportação de rastros (traces).",
          },
          metrics: {
            title: "Métricas OpenTelemetry Habilitadas",
            description: "Habilitar exportação de métricas.",
          },
          logs: {
            title: "Logs OpenTelemetry Habilitados",
            description: "Habilitar exportação de logs via OpenTelemetry.",
          },
          sampleRate: {
            title: "Taxa de Amostragem de Rastreamento",
            description: "Taxa de amostragem para rastreamento (0.0 a 1.0).",
          },
          flushIntervalMs: {
            title: "Intervalo de Envio (ms)",
            description: "Intervalo entre o envio de lotes de telemetria.",
          },
        },
        cacheTrace: {
          title: "Rastreio de Cache",
          description: "Grava rastros de depuração para operações de cache em um arquivo.",
          enabled: {
            title: "Rastreamento de Cache Ativado",
            description: "Gravar detalhes de cache em um arquivo de rastreamento.",
          },
          filePath: {
            title: "Caminho do Arquivo de Rastreamento",
            description: "Caminho do arquivo onde o rastreamento será salvo.",
          },
          includeMessages: {
            title: "Incluir Mensagens no Rastreamento",
            description: "Incluir o conteúdo das mensagens no rastreamento.",
          },
          includePrompt: {
            title: "Incluir Prompt no Rastreamento",
            description: "Incluir o prompt enviado ao modelo no rastreamento.",
          },
          includeSystem: {
            title: "Incluir Sistema no Rastreamento",
            description: "Incluir instruções de sistema no rastreamento.",
          },
        },
      },
      gateway: {
        port: { title: "Porta", description: "Porta HTTP para o servidor gateway." },
        mode: {
          title: "Modo",
          description: "Modo de operação do gateway (local ou remoto).",
        },
        bind: {
          title: "Vínculo de Rede",
          description: "Interface de rede para vincular o servidor.",
        },
        auth: {
          title: "Autenticação",
          description: "Configurações de autenticação para acesso ao gateway.",
          mode: {
            title: "Modo de Autenticação",
            description: "Método de autenticação (token ou senha).",
          },
          token: { title: "Token do Gateway", description: "Token estático para acesso à API." },
          password: {
            title: "Senha do Gateway",
            description: "Senha para acesso à interface de controle.",
          },
          allowTailscale: {
            title: "Permitir Tailscale",
            description: "Permitir autenticação automática via Tailscale.",
          },
        },
        trustedProxies: {
          title: "Proxies Confiáveis",
          description: "Lista de IPs ou redes de proxy confiáveis.",
        },
        tailscale: {
          title: "Tailscale",
          description: "Integração com VPN Tailscale para acesso remoto seguro.",
          mode: {
            title: "Modo Tailscale",
            description: "Configuração de exposição via Tailscale.",
          },
          resetOnExit: {
            title: "Redefinir ao Sair",
            description: "Remover a configuração do Tailscale ao desligar.",
          },
        },
        remote: {
          title: "Remoto",
          description: "Configurações para conexão com servidor gateway remoto.",
          url: {
            title: "URL do Gateway Remoto",
            description: "Endereço do servidor de gateway remoto.",
          },
          transport: {
            title: "Transporte",
            description: "Protocolo de transporte (SSH ou Direto).",
          },
          token: {
            title: "Token do Gateway Remoto",
            description: "Token para autenticação remota.",
          },
          password: {
            title: "Senha do Gateway Remoto",
            description: "Senha para autenticação remota.",
          },
          tlsFingerprint: {
            title: "Impressão Digital TLS",
            description: "Assinatura do certificado para validação.",
          },
          sshTarget: { title: "Alvo SSH", description: "Endereço SSH para o túnel." },
          sshIdentity: {
            title: "Identidade SSH",
            description: "Caminho para a chave privada SSH.",
          },
        },
        controlUi: {
          title: "Interface de Controle",
          description: "Interface web de administração para configurar e monitorar o gateway.",
          enabled: {
            title: "Habilitar Interface",
            description: "Ativar a interface de gerenciamento web.",
          },
          basePath: {
            title: "Caminho Base",
            description: "Prefixo da URL sob o qual a interface de controle está acessível.",
          },
          root: {
            title: "Diretório Raiz",
            description: "Caminho no sistema de arquivos para os ativos da UI pré-construídos.",
          },
          allowedOrigins: {
            title: "Origens Permitidas (CORS)",
            description:
              "Lista de domínios permitidos para interagir com a API do gateway via navegador.",
          },
          allowInsecureAuth: {
            title: "Permitir Autenticação Insegura",
            description: "Permitir autenticação em conexões não-HTTPS (apenas para depuração).",
          },
          dangerouslyDisableDeviceAuth: {
            title: "Desativar Autenticação de Dispositivo (Perigoso)",
            description:
              "Ignorar verificações de segurança de nível de dispositivo para login na UI.",
          },
        },
        tls: {
          title: "TLS (HTTPS)",
          description: "Configurações de segurança de transporte para conexões criptografadas.",
          enabled: { title: "TLS Habilitado", description: "Habilitar criptografia HTTPS." },
          autoGenerate: {
            title: "Gerar Certificado Automaticamente",
            description: "Criar certificados autoassinados automaticamente.",
          },
          certPath: {
            title: "Caminho do Certificado",
            description: "Caminho para o arquivo .crt ou .pem.",
          },
          keyPath: {
            title: "Caminho da Chave",
            description: "Caminho para o arquivo de chave privada .key.",
          },
          caPath: {
            title: "Caminho da CA",
            description: "Caminho para o arquivo da autoridade certificadora (opcional).",
          },
        },
        http: {
          title: "Endpoints HTTP",
          description: "Configuração para endpoints de API HTTP expostos pelo gateway.",
          endpoints: {
            chatCompletions: {
              enabled: {
                title: "Endpoint de Completions OpenAI",
                description: "Emular API da OpenAI.",
              },
            },
            responses: {
              enabled: {
                title: "Endpoint de Respostas",
                description: "Habilitar processamento de respostas via HTTP.",
              },
              maxBodyBytes: {
                title: "Tamanho Máximo do Corpo",
                description: "Limite de bytes para o corpo da requisição.",
              },
              files: {
                allowUrl: { title: "Permitir URLs", description: "Permitir download via URL." },
                allowedMimes: {
                  title: "Tipos MIME Permitidos",
                  description: "Tipos de arquivo aceitos.",
                },
                maxBytes: {
                  title: "Tamanho Máximo (Bytes)",
                  description: "Tamanho máximo por arquivo.",
                },
                maxChars: {
                  title: "Máximo de Caracteres",
                  description: "Limite de texto extraído.",
                },
                maxRedirects: {
                  title: "Máximo de Redirecionamentos",
                  description: "Limite de saltos HTTP.",
                },
                timeoutMs: {
                  title: "Tempo Limite (ms)",
                  description: "Timeout para download de arquivos.",
                },
                pdf: {
                  maxPages: {
                    title: "Máximo de Páginas PDF",
                    description: "Limite de páginas para processar.",
                  },
                  maxPixels: {
                    title: "Máximo de Pixels",
                    description: "Resolução máxima para imagens PDF.",
                  },
                  minTextChars: {
                    title: "Mínimo de Caracteres",
                    description: "Mínimo para considerar texto extraível.",
                  },
                },
              },
              images: {
                allowUrl: {
                  title: "Permitir URLs",
                  description: "Permitir carregar imagens via URL.",
                },
                allowedMimes: {
                  title: "Tipos MIME Permitidos",
                  description: "Formatos de imagem aceitos.",
                },
                maxBytes: {
                  title: "Tamanho Máximo (Bytes)",
                  description: "Tamanho máximo por imagem.",
                },
              },
            },
          },
        },
        reload: {
          title: "Recarga",
          description: "Configuração de como o gateway lida com mudanças de configuração.",
          mode: {
            title: "Modo de Recarga",
            description: "Como o gateway reinicia após mudanças na configuração.",
          },
          debounceMs: {
            title: "Debounce de Recarga (ms)",
            description: "Atraso antes de aplicar a recarga.",
          },
        },
        nodes: {
          title: "Nodes",
          description: "Configurações para nodes distribuídos do gateway.",
          browser: {
            mode: {
              title: "Modo de Navegador de Node",
              description: "Como os nodes lidam com sessões de navegador.",
            },
            node: {
              title: "Node de Navegador Fixo",
              description: "Vincular sessões de browser a um node específico.",
            },
          },
          allowCommands: {
            title: "Comandos Permitidos (Node)",
            description: "Lista de comandos permitidos para execução remota.",
          },
          denyCommands: {
            title: "Comandos Bloqueados (Node)",
            description: "Lista de comandos proibidos para execução remota.",
          },
        },
      },
      ui: {
        seamColor: {
          title: "Cor de Destaque",
          description: "Cor de destaque para a interface do usuário.",
        },
        assistant: {
          title: "Assistente",
          description: "Personalize a identidade do assistente exibida no chat.",
          name: { title: "Nome do Assistente", description: "Nome usado pelo assistente no chat." },
          avatar: {
            title: "Avatar do Assistente",
            description: "URL ou caminho local para o avatar do assistente.",
          },
        },
      },
      messages: {
        messagePrefix: {
          title: "Prefixo de Mensagem",
          description: "Texto prefixado em mensagens enviadas.",
        },
        responsePrefix: {
          title: "Prefixo de Resposta",
          description: "Texto prefixado em respostas do bot.",
        },
        groupChat: {
          title: "Chat em Grupo",
          description: "Habilitar ou configurar chat em grupo.",
        },
        queue: {
          title: "Fila de Mensagens",
          description: "Configurações para o enfileiramento de mensagens.",
        },
        ackReaction: {
          title: "Emoji de Confirmação",
          description: "Emoji usado para confirmação de mensagens.",
        },
        ackReactionScope: {
          title: "Escopo da Confirmação",
          description: "Escopo para as reações de confirmação.",
        },
        removeAckAfterReply: {
          title: "Remover Confirmação Após Resposta",
          description: "Limpar o emoji após responder.",
        },
        tts: { title: "Conversão de Voz (TTS)", description: "Configuração para síntese de fala." },
        inbound: {
          title: "Entrada",
          description: "Configurações para o tratamento de mensagens recebidas.",
          debounceMs: {
            title: "Debounce de Entrada (ms)",
            description: "Tempo de espera (debounce) para mensagens recebidas.",
          },
        },
      },
      tools: {
        exec: {
          title: "Execução",
          description: "Configurações para execução de código e comandos.",
          applyPatch: {
            title: "Aplicar Patch",
            enabled: {
              title: "Habilitar apply_patch",
              description: "Permitir que agentes usem a ferramenta apply_patch.",
            },
            allowModels: {
              title: "Modelos Permitidos para Patch",
              description: "Lista de modelos autorizados a realizar patches no código-fonte.",
            },
          },
          notifyOnExit: {
            title: "Notificar ao Sair",
            description:
              "Enviar uma notificação quando uma execução de longa duração for concluída.",
          },
          approvalRunningNoticeMs: {
            title: "Aviso de Aprovação em Execução (ms)",
            description: "Tempo para exibir um aviso antes que uma auto-aprovação seja executada.",
          },
          host: { title: "Host de Execução", description: "Host alvo para execução de comandos." },
          security: {
            title: "Segurança de Execução",
            description: "Perfil de segurança para o ambiente de execução.",
          },
          ask: {
            title: "Perguntar ao Executar",
            description: "Exigir aprovação do usuário para todas as execuções.",
          },
          node: {
            title: "Vínculo de Node de Execução",
            description: "Node específico atribuído para lidar com tarefas de execução.",
          },
          pathPrepend: {
            title: "Adicionar ao Início do PATH (Prepend)",
            description: "Diretórios para adicionar ao início do PATH de execução.",
          },
          safeBins: {
            title: "Binários Seguros",
            description:
              "Lista de caminhos de binários permitidos para execução sem restrições adicionais de sandbox.",
          },
        },
        message: {
          title: "Mensagens",
          description: "Configuração interna de roteamento e entrega de mensagens.",
          allowCrossContextSend: {
            title: "Permitir Envio Cruzado",
            description: "Permitir o envio de mensagens entre diferentes contextos de conversa.",
          },
          crossContext: {
            title: "Contexto Cruzado",
            description: "Roteamento avançado para comunicação entre contextos.",
            allowWithinProvider: {
              title: "Permitir Mesmo Provedor",
              description: "Permitir contexto cruzado dentro do mesmo provedor de serviço.",
            },
            allowAcrossProviders: {
              title: "Permitir Entre Provedores",
              description: "Permitir contexto cruzado entre diferentes provedores de serviço.",
            },
            marker: {
              title: "Marcador",
              description: "Indicadores visuais para mensagens de contexto cruzado.",
              enabled: {
                title: "Marcador de Contexto",
                description: "Habilitar marcadores em mensagens de contexto cruzado.",
              },
              prefix: {
                title: "Prefixo do Marcador",
                description: "Símbolo ou texto antes do ID do contexto.",
              },
              suffix: {
                title: "Sufixo do Marcador",
                description: "Símbolo ou texto após o ID do contexto.",
              },
            },
          },
          broadcast: {
            title: "Transmissão (Broadcast)",
            description:
              "Ferramentas para enviar mensagens para múltiplos destinatários simultaneamente.",
            enabled: {
              title: "Transmissão Habilitada",
              description: "Ativar ou desativar a ferramenta de transmissão.",
            },
          },
        },
        web: {
          title: "Web",
          description: "Ferramentas de navegação, pesquisa e extração de conteúdo web.",

          search: {
            title: "Pesquisa Web",
            description: "Pesquisar na web por informações usando provedores externos.",
            enabled: {
              title: "Pesquisa Web Ativada",
              description: "Ativar a ferramenta de pesquisa.",
            },

            provider: {
              title: "Provedor de Pesquisa",
              description: "Provedor de mecanismo de busca principal.",
            },
            apiKey: {
              title: "Chave de API de Pesquisa",
              description: "Chave de API para o provedor de pesquisa.",
            },
            maxResults: {
              title: "Máximo de Resultados",
              description: "Número máximo de resultados de pesquisa.",
            },
            timeoutSeconds: {
              title: "Timeout (seg)",
              description: "Limite de tempo para solicitações de pesquisa.",
            },
            cacheTtlMinutes: {
              title: "TTL de Cache (min)",
              description: "Duração para manter resultados em cache.",
            },
            perplexity: {
              apiKey: {
                title: "Chave de API Perplexity",
                description: "Autenticação para a API da Perplexity.",
              },
              baseUrl: {
                title: "URL Base Perplexity",
                description: "URL base para as requisições da Perplexity.",
              },
              model: {
                title: "Modelo Perplexity",
                description: "Modelo para usar com o serviço da Perplexity.",
              },
            },
          },
          fetch: {
            title: "Busca Web (Fetch)",
            description: "Recuperar conteúdo de URLs web específicas.",

            enabled: {
              title: "Busca Web (Fetch) Ativada",
              description: "Ativar a ferramenta de busca web.",
            },
            maxChars: {
              title: "Máximo de Caracteres",
              description: "Máximo de caracteres a extrair de uma página.",
            },
            maxCharsCap: {
              title: "Teto Máximo de Caracteres",
              description: "Limite superior absoluto para extração.",
            },
            timeoutSeconds: {
              title: "Timeout (seg)",
              description: "Timeout de conexão e download.",
            },
            cacheTtlMinutes: {
              title: "TTL de Cache (min)",
              description: "Duração para manter conteúdo buscado em cache.",
            },
            maxRedirects: {
              title: "Máximo de Redirecionamentos",
              description: "Número máximo de redirecionamentos HTTP.",
            },
            userAgent: {
              title: "User-Agent",
              description: "Cabeçalho de identificação do gateway.",
            },
            readability: {
              title: "Usar Readability",
              description: "Aplicar algoritmo de legibilidade para extrair conteúdo principal.",
            },
            firecrawl: {
              enabled: {
                title: "Firecrawl Habilitado",
                description: "Habilitar Firecrawl para raspagem web.",
              },
              apiKey: {
                title: "Chave de API Firecrawl",
                description: "Chave de API para o serviço Firecrawl.",
              },
              baseUrl: {
                title: "URL Base Firecrawl",
                description: "URL personalizada para a API do Firecrawl.",
              },
              onlyMainContent: {
                title: "Apenas Conteúdo Principal",
                description: "Extrair apenas o conteúdo principal das páginas.",
              },
              maxAgeMs: {
                title: "Idade Máxima (ms)",
                description: "Idade máxima do cache para os resultados.",
              },
              timeoutSeconds: {
                title: "Timeout Firecrawl (seg)",
                description: "Tempo limite para as requisições de raspagem.",
              },
            },
          },
        },
        links: {
          title: "Análise de Links",
          description: "Análise e extração de conteúdo de links encontrados em mensagens.",
          enabled: {
            title: "Análise de Links Habilitada",
            description: "Ativar a ferramenta de análise de links.",
          },
          maxLinks: {
            title: "Máximo de Links",
            description: "Número máximo de links a analisar por mensagem.",
          },
          timeoutSeconds: {
            title: "Timeout (seg)",
            description: "Limite de tempo para análise de links.",
          },
          models: {
            title: "Modelos de Análise de Link",
            description: "Modelos usados para extração de conteúdo de links.",
          },
          scope: {
            title: "Escopo de Link",
            description: "Compartilhamento de contexto para análise de links.",
          },
        },
        media: {
          title: "Processamento de Mídia",
          description: "Configurações globais para processamento de imagem, áudio e vídeo.",
          models: {
            title: "Modelos de Mídia Compartilhados",
            description: "Modelos padrão para compreensão de mídia.",
          },
          concurrency: {
            title: "Concorrência de Mídia",
            description: "Limite de tarefas simultâneas de processamento.",
          },
          image: {
            title: "Compreensão de Imagem",
            description: "Configurações para analisar e extrair texto/significado de imagens.",
            enabled: {
              title: "Compreensão de Imagem Ativada",
              description: "Ativar a ferramenta de processamento de imagem.",
            },

            maxBytes: {
              title: "Máximo de Bytes",
              description: "Limite de tamanho para arquivos de imagem.",
            },
            maxChars: { title: "Máximo de Caracteres", description: "Máximo de texto a extrair." },
            prompt: {
              title: "Prompt de Imagem",
              description: "Instrução padrão para análise de imagem.",
            },
            timeoutSeconds: {
              title: "Timeout (seg)",
              description: "Limite de tempo para processamento.",
            },
            attachments: {
              title: "Política de Anexos",
              description: "Como lidar com anexos de imagem.",
            },
            models: {
              title: "Modelos de Imagem",
              description: "Modelos específicos para compreensão de imagem.",
            },
            scope: { title: "Escopo de Imagem", description: "Compartilhamento de contexto." },
          },
          audio: {
            title: "Compreensão de Áudio",
            description: "Configurações para transcrever e analisar arquivos de áudio.",
            enabled: {
              title: "Compreensão de Áudio Ativada",
              description: "Ativar a ferramenta de processamento de áudio.",
            },

            maxBytes: {
              title: "Máximo de Bytes",
              description: "Limite de tamanho para arquivos de áudio.",
            },
            maxChars: {
              title: "Máximo de Caracteres",
              description: "Máximo de texto a transcrever.",
            },
            prompt: {
              title: "Prompt de Áudio",
              description: "Instrução padrão para análise de áudio.",
            },
            timeoutSeconds: {
              title: "Timeout (seg)",
              description: "Limite de tempo para processamento.",
            },
            language: {
              title: "Idioma do Áudio",
              description: "Código do idioma para transcrição.",
            },
            attachments: {
              title: "Política de Anexos",
              description: "Como lidar com anexos de áudio.",
            },
            models: {
              title: "Modelos de Áudio",
              description: "Modelos específicos para compreensão de áudio.",
            },
            scope: { title: "Escopo de Áudio", description: "Compartilhamento de contexto." },
          },
          video: {
            title: "Compreensão de Vídeo",
            description: "Configurações para analisar conteúdo de vídeo.",
            enabled: {
              title: "Compreensão de Vídeo Ativada",
              description: "Ativar a ferramenta de processamento de vídeo.",
            },

            maxBytes: {
              title: "Máximo de Bytes",
              description: "Limite de tamanho para arquivos de vídeo.",
            },
            maxChars: { title: "Máximo de Caracteres", description: "Máximo de texto a extrair." },
            prompt: {
              title: "Prompt de Vídeo",
              description: "Instrução padrão para análise de vídeo.",
            },
            timeoutSeconds: {
              title: "Timeout (seg)",
              description: "Limite de tempo para processamento.",
            },
            attachments: {
              title: "Política de Anexos",
              description: "Como lidar com anexos de vídeo.",
            },
            models: {
              title: "Modelos de Vídeo",
              description: "Modelos específicos para compreensão de vídeo.",
            },
            scope: { title: "Escopo de Vídeo", description: "Compartilhamento de contexto." },
          },
        },
        profile: {
          title: "Perfil de Ferramentas",
          description: "Perfil de ferramentas para este agente.",
        },
        alsoAllow: {
          title: "Permissões Adicionais de Ferramentas",
          description: "Ferramentas adicionais permitidas.",
        },
        byProvider: {
          title: "Política de Ferramentas por Provedor",
          description: "Políticas de ferramentas específicas por provedor.",
        },
        allow: {
          title: "Ferramentas Permitidas",
          description: "Ferramentas explicitamente permitidas para este agente.",
        },
        deny: {
          title: "Ferramentas Negadas",
          description: "Ferramentas explicitamente bloqueadas para este agente.",
        },
        elevated: {
          title: "Ferramentas Elevadas",
          description: "Ferramentas que requerem permissões elevadas.",
        },
        sandbox: {
          title: "Sandbox",
          description: "Configuração do sandbox de execução de código.",
          enabled: {
            title: "Sandbox Habilitado",
            description: "Habilitar execução de código em sandbox.",
          },
          mode: { title: "Modo de Sandbox", description: "Tipo de isolamento do sandbox." },
        },
        subagents: {
          title: "Subagentes",
          description: "Configurações para criar e gerenciar subagentes.",
          enabled: {
            title: "Subagentes Habilitados",
            description: "Permitir que este agente crie subagentes.",
          },
          maxDepth: {
            title: "Profundidade Máxima",
            description: "Profundidade máxima de aninhamento para subagentes.",
          },
        },
        agentToAgent: {
          title: "Agente para Agente",
          description: "Configurações de ferramenta de comunicação entre agentes.",
          enabled: {
            title: "Habilitado",
            description: "Habilitar ferramentas de comunicação entre agentes.",
          },
        },
      },
      channels: {
        telegram: {
          title: "Telegram",
          description: "Registre um bot com o @BotFather e comece.",
          accounts: {
            title: "Contas",
            "*": {
              title: "Configuração de Conta",
              botToken: {
                title: "Token do Bot",
                description: "Token de autenticação para o bot do Telegram.",
              },
              dmPolicy: {
                title: "Política de DM",
                description: "Como lidar com mensagens diretas.",
              },
              allowFrom: {
                title: "Permitir De",
                description: "IDs de usuários permitidos para mensagens.",
              },
              groupAllowFrom: {
                title: "Permitir De (Grupo)",
                description: "IDs de grupos permitidos.",
              },
              historyLimit: {
                title: "Limite do Histórico",
                description: "Número de mensagens mantidas no contexto.",
              },
              blockStreaming: {
                title: "Bloquear Streaming",
                description: "Desativar streaming de mensagens em tempo real.",
              },
              linkPreview: {
                title: "Prévia de Link",
                description: "Ativar ou desativar prévias de link.",
              },
              responsePrefix: {
                title: "Prefixo de Resposta",
                description: "Texto adicionado antes das respostas do bot.",
              },
              replyToMode: {
                title: "Modo de Resposta",
                description: "Como o bot responde às mensagens.",
              },
              groupPolicy: {
                title: "Política de Grupo",
                description: "Como lidar com mensagens de grupo.",
              },
              mediaMaxMb: {
                title: "Máximo de MB de Mídia",
                description: "Tamanho máximo de arquivo de mídia em MB.",
              },
            },
          },
          draftChunk: {
            title: "Fragmento de Rascunho",
            description: "Configurações de fragmentação de mensagens em rascunho para o Telegram.",
            breakPreference: {
              title: "Preferência de Quebra de Fragmento",
              description:
                "Pontos de quebra preferidos para fragmentos de rascunho (parágrafo | nova linha | frase). Padrão: parágrafo.",
            },
            maxChars: {
              title: "Máximo de Caracteres do Fragmento",
              description:
                'Tamanho máximo de um fragmento de rascunho quando streamMode="block" (padrão: 800).',
            },
            minChars: {
              title: "Mínimo de Caracteres do Fragmento",
              description:
                'Mínimo de caracteres antes de emitir uma atualização quando streamMode="block" (padrão: 200).',
            },
          },
          streamMode: {
            title: "Modo de Stream",
            description: "Como o streaming de mensagens é tratado.",
          },
          textChunkLimit: {
            title: "Limite de Fragmento de Texto",
            description: "Limite máximo de caracteres por fragmento.",
          },
        },
        whatsapp: {
          title: "WhatsApp",
          selfChatMode: {
            title: "Modo de Telefone Próprio",
            description: "Como lidar com mensagens do seu próprio número.",
          },
          debounceMs: {
            title: "Debounce (ms)",
            description: "Tempo de espera antes de processar mensagens recebidas.",
          },
        },
        discord: {
          title: "Discord",
          token: {
            title: "Token do Bot",
            description: "Token de autenticação para o bot do Discord.",
          },
          maxLinesPerMessage: {
            title: "Máximo de Linhas por Mensagem",
            description: "Número máximo de linhas por mensagem.",
          },
        },
        slack: {
          title: "Slack",
          botToken: {
            title: "Token do Bot",
            description: "Token de autenticação para o bot do Slack.",
          },
          appToken: { title: "Token do App", description: "Token do aplicativo para modo socket." },
          thread: {
            title: "Thread",
            historyScope: {
              title: "Escopo do Histórico de Threads",
              description: "Escopo para histórico de mensagens em threads.",
            },
            inheritParent: {
              title: "Herdar do Pai",
              description: "Herdar configuração da thread pai.",
            },
          },
        },
        mattermost: {
          title: "Mattermost",
          description: "Configuração de integração com Mattermost.",
        },
        signal: { title: "Signal", description: "Configuração do mensageiro Signal." },
        imessage: {
          title: "iMessage",
          description: "Integração com iMessage da Apple (apenas macOS).",
        },
        bluebubbles: {
          title: "BlueBubbles",
          description: "Configuração da ponte BlueBubbles iMessage.",
        },
        msteams: {
          title: "MS Teams",
          description: "Configuração de integração com Microsoft Teams.",
        },
      },
      memory: {
        backend: {
          title: "Backend de Memória",
          description: 'Provedor de memória ("Integrado" para nativo ou "QMD" para sidecar).',
        },
        citations: { title: "Citações", description: "Comportamento padrão de citações." },
        qmd: {
          title: "Configuração QMD",
          description: "Configurações para o sidecar de memória QMD.",
          command: {
            title: "Binário QMD",
            description: "Caminho para o binário executável do QMD.",
          },
          includeDefaultMemory: {
            title: "Incluir Memória Padrão",
            description: "Incluir arquivos de memória padrão no QMD.",
          },
          scope: {
            title: "Escopo de Superfície QMD",
            description: "Nível de escopo para buscas de memória QMD.",
          },
          paths: {
            title: "Caminhos Extras QMD",
            path: { title: "Caminho", description: "Caminho do diretório para memória adicional." },
            pattern: {
              title: "Padrão",
              description: "Padrão de arquivo para corresponder (glob).",
            },
            name: { title: "Nome", description: "Nome de exibição para este caminho de memória." },
          },
          sessions: {
            enabled: {
              title: "Indexação de Sessões QMD",
              description: "Ativar indexação de transcrições de sessão.",
            },
            exportDir: {
              title: "Diretório de Exportação",
              description: "Diretório para dados de sessão exportados.",
            },
            retentionDays: {
              title: "Retenção (dias)",
              description: "Dias para reter dados de sessão.",
            },
          },
          update: {
            interval: {
              title: "Intervalo de Atualização",
              description: "Intervalo entre verificações de atualização.",
            },
            debounceMs: {
              title: "Debounce (ms)",
              description: "Tempo de espera antes de disparar atualização.",
            },
            onBoot: {
              title: "Atualizar na Inicialização (Boot)",
              description: "Atualizar índice na inicialização do gateway.",
            },
            waitForBootSync: {
              title: "Aguardar Sincronização na Inicialização",
              description: "Bloquear até a sincronização inicial completar.",
            },
            embedInterval: {
              title: "Intervalo de Embedding",
              description: "Intervalo para atualizações de embedding.",
            },
            commandTimeoutMs: {
              title: "Timeout de Comando (ms)",
              description: "Timeout para comandos QMD.",
            },
            updateTimeoutMs: {
              title: "Timeout de Atualização (ms)",
              description: "Timeout para operações de atualização.",
            },
            embedTimeoutMs: {
              title: "Timeout de Embedding (ms)",
              description: "Timeout para operações de embedding.",
            },
          },
          limits: {
            maxResults: {
              title: "Máximo de Resultados",
              description: "Máximo de resultados de busca a retornar.",
            },
            maxSnippetChars: {
              title: "Máximo de Caracteres do Trecho (Snippet)",
              description: "Máximo de caracteres por trecho.",
            },
            maxInjectedChars: {
              title: "Máximo de Caracteres Injetados",
              description: "Máximo de caracteres injetados no contexto.",
            },
            timeoutMs: {
              title: "Tempo Limite (ms)",
              description: "Timeout de busca em milissegundos.",
            },
          },
        },
      },
      agents: {
        title: "Agentes",
        description: "Configurações de agentes, modelos e identidades.",
        thinking: {
          title: "Racio. Padrão (Thinking)",
          description: "Nível de detalhamento do raciocínio interno exibido.",
        },
        thinking_default: {
          title: "Racio. Padrão (Thinking)",
          description: "Nível de detalhamento do raciocínio interno exibido.",
        },
        thinkingDefault: {
          title: "Racio. Padrão (Thinking)",
          description: "Nível de detalhamento do raciocínio interno exibido.",
        },
        defaults: {
          title: "Padrões",
          description: "Configurações padrão aplicadas a todos os agentes.",
          workspace: {
            title: "Espaço de Trabalho (Workspace)",
            description: "Diretório base para arquivos e dados do agente.",
          },
          repoRoot: {
            title: "Raiz do Repositório",
            description: "Caminho raiz para operações de Git e acesso a arquivos.",
          },
          contextTokens: {
            title: "Tokens de Contexto",
            description: "Limite máximo de tokens para o contexto da conversa.",
          },
          model: {
            primary: {
              title: "Modelo Primário",
              description: "Modelo de IA principal usado para chat e lógica.",
            },
            fallbacks: {
              title: "Modelos de Fallback",
              description: "Modelos usados caso o primário falhe ou esteja indisponível.",
            },
          },
          imageModel: {
            title: "Modelo de Imagem",
            description: "Configuração do modelo de imagem padrão e seus fallbacks.",
            primary: {
              title: "Modelo de Imagem",
              description: "Modelo usado para geração ou análise de imagens.",
            },
            fallbacks: {
              title: "Modelos de Imagem de Fallback",
              description: "Alternativas para processamento de imagens.",
            },
          },
          thinkingDefault: {
            title: "Racio. Padrão (Thinking)",
            description: "Nível de detalhamento do raciocínio interno exibido.",
          },
          thinking: {
            title: "Racio. Padrão (Thinking)",
            description: "Nível de detalhamento do raciocínio interno exibido.",
          },
          thinking_default: {
            title: "Racio. Padrão (Thinking)",
            description: "Nível de detalhamento do raciocínio interno exibido.",
          },
          verboseDefault: {
            title: "Verbosidade Padrão",
            description: "Quantidade de logs e detalhes internos exibidos.",
          },
          elevatedDefault: {
            title: "Permissão Elevada Padrão",
            description: "Configuração padrão para comandos que exigem privilégios elevados.",
          },
          maxConcurrent: {
            title: "Máxima Concorrência",
            description: "Número máximo de solicitações simultâneas por agente.",
          },
          typingMode: {
            title: "Modo de Digitação",
            description: "Controla quando o indicador 'digitando' é exibido.",
          },
          typingIntervalSeconds: {
            title: "Intervalo de Digitação (segundos)",
            description: "Frequência de atualização do indicador de digitação.",
          },
          bootstrapMaxChars: {
            title: "Máximo de Caracteres de Inicialização",
            description: "Limite de texto carregado durante o bootstrap do agente.",
          },
          userTimezone: {
            title: "Fuso Horário do Usuário",
            description: "Fuso horário para exibir datas nas conversas.",
          },
          envelopeTimezone: {
            title: "Fuso Horário no Envelope",
            description: "Fuso horário usado nos metadados das mensagens.",
          },
          envelopeTimestamp: {
            title: "Timestamp no Envelope",
            description: "Incluir data/hora absoluta nos metadados.",
          },
          envelopeElapsed: {
            title: "Tempo Decorrido no Envelope",
            description: "Incluir tempo relativo desde a última mensagem.",
          },
          timeoutSeconds: {
            title: "Tempo Limite (segundos)",
            description: "Tempo máximo de espera por uma resposta do modelo.",
          },
          mediaMaxMb: {
            title: "Tamanho Máximo de Mídia (MB)",
            description: "Limite de tamanho para arquivos de mídia processados.",
          },
          heartbeat: {
            title: "Batimento (Heartbeat)",
            description: "Configurações de execução periódica automática.",
            every: { title: "Frequência", description: "Intervalo entre batimentos (ex: 5m, 1h)." },
            prompt: {
              title: "Prompt do Heartbeat",
              description: "Instrução enviada ao agente no batimento.",
            },
            accountId: {
              title: "ID da Conta",
              description: "ID da conta para entregas do heartbeat.",
            },
            ackMaxChars: {
              title: "Máximo de Caracteres Ack",
              description: "Limite de caracteres para mensagens de confirmação.",
            },
            activeHours: {
              title: "Horário de Atividade",
              description: "Define quando o heartbeat está ativo.",
              start: { title: "Início", description: "Hora de início (formato HH:MM)." },
              end: { title: "Fim", description: "Hora de término (formato HH:MM)." },
              timezone: {
                title: "Fuso Horário",
                description: "Fuso horário para o horário de atividade.",
              },
            },
            model: { title: "Modelo", description: "Modelo de IA para o heartbeat." },
            session: { title: "Sessão", description: "Configuração de sessão para o heartbeat." },
            includeReasoning: {
              title: "Incluir Raciocínio",
              description: "Incluir cadeia de pensamento nas respostas.",
            },
            target: {
              title: "Alvo",
              description: "Alvo de entrega ('Último', 'Nenhum' ou ID de canal).",
            },
            to: { title: "Para", description: "Destinatário da mensagem." },
          },
          subagents: {
            title: "Sub-agentes",
            description: "Configurações para agentes secundários iniciados pelo principal.",
            maxConcurrent: {
              title: "Máxima Concorrência de Sub-agentes",
              description: "Limite de sub-agentes simultâneos.",
            },
            archiveAfterMinutes: {
              title: "Arquivar Após (minutos)",
              description: "Tempo de inatividade para arquivar sessões de sub-agentes.",
            },
            model: {
              title: "Modelo de Sub-agente",
              description: "Modelo de IA padrão para sub-agentes.",
            },
            thinking: {
              title: "Raciocínio dos Sub-agentes",
              description: "Nível de pensamento/raciocínio dos sub-agentes.",
            },
          },
          sandbox: {
            title: "Sandbox",
            description: "Ambiente isolado para execução segura de ferramentas.",
            mode: {
              title: "Modo Sandbox",
              description: "Nível de isolamento (Desligado, Não-principal ou Todos).",
            },
            workspaceAccess: {
              title: "Acesso ao Espaço de Trabalho",
              description: "Nível de acesso aos arquivos (Nenhum, RO ou RW).",
            },
            sessionToolsVisibility: {
              title: "Visibilidade de Ferramentas",
              description: "Define quais ferramentas são visíveis dentro da sandbox.",
            },
            scope: {
              title: "Escopo da Sandbox",
              description: "Compartilhamento do ambiente (Sessão, Agente ou Global).",
            },
            perSession: {
              title: "Por Sessão",
              description: "Se deve criar uma sandbox nova para cada sessão.",
            },
            docker: {
              title: "Configurações Docker",
              image: {
                title: "Imagem Docker",
                description: "Imagem Docker para o container sandbox.",
              },
              containerPrefix: {
                title: "Prefixo do Container",
                description: "Prefixo para nomes de containers.",
              },
              workdir: {
                title: "Diretório de Trabalho",
                description: "Diretório de trabalho dentro do container.",
              },
              readOnlyRoot: {
                title: "Sistema de Arquivos Somente Leitura",
                description: "Montar sistema de arquivos raíz como somente leitura.",
              },
              binds: { title: "Montagens (Binds)", description: "Volumes montados no container." },
              capDrop: {
                title: "Remover Capacidades (Cap Drop)",
                description: "Remover capacidades Linux do container.",
              },
              tmpfs: { title: "Tmpfs", description: "Montagens tmpfs no container." },
              env: {
                title: "Variáveis de Ambiente",
                description: "Variáveis de ambiente do container.",
              },
              extraHosts: { title: "Hosts Extras", description: "Hosts adicionais (/etc/hosts)." },
              dns: { title: "DNS", description: "Servidores DNS para o container." },
              network: { title: "Rede", description: "Configuração de rede Docker." },
              user: {
                title: "Usuário Docker",
                description: "Usuário para executar comandos dentro do container.",
              },
              setupCommand: {
                title: "Comando de Configuração",
                description: "Comando a executar na inicialização do container.",
              },
              seccompProfile: {
                title: "Perfil Seccomp",
                description: "Perfil de segurança Seccomp para o container.",
              },
              apparmorProfile: {
                title: "Perfil Apparmor",
                description: "Perfil de segurança AppArmor para o container.",
              },
              pidsLimit: {
                title: "Limite de PIDs",
                description: "Número máximo de processos no container.",
              },
              ulimits: {
                title: "Limites de Recursos (Ulimits)",
                description: "Limites de recursos para o container.",
              },
              memory: { title: "Memória", description: "Limite de memória para o container." },
              memorySwap: {
                title: "Swap de Memória",
                description: "Limite de swap de memória para o container.",
              },
              autoStartTimeoutMs: {
                title: "Tempo Limite de Início Automático (ms)",
                description: "Timeout para início automático do container.",
              },
              allowHostControl: {
                title: "Permitir Controle do Host",
                description: "Permitir que container controle aspectos do host.",
              },
            },
            browser: {
              title: "Navegador na Sandbox",
              enabled: {
                title: "Habilitar Navegador",
                description: "Habilitar automação de navegador na sandbox.",
              },
              image: {
                title: "Imagem do Navegador",
                description: "Imagem Docker para container do navegador.",
              },
              containerPrefix: {
                title: "Prefixo do Container",
                description: "Prefixo para containers do navegador.",
              },
              cdpPort: { title: "Porta CDP", description: "Porta para protocolo Chrome DevTools." },
              headless: {
                title: "Modo Headless (Sem Interface)",
                description: "Executar navegador sem exibir interface.",
              },
              autoStart: {
                title: "Início Automático",
                description: "Iniciar navegador automaticamente sob demanda.",
              },
              vncPort: {
                title: "Porta VNC",
                description: "Porta para acesso via área de trabalho remota VNC.",
              },
              noVncPort: { title: "Porta noVNC", description: "Porta para acesso noVNC via web." },
              enableNoVnc: {
                title: "Habilitar noVNC",
                description: "Habilitar acesso VNC via web.",
              },
            },
            workspaceRoot: {
              title: "Raiz do Workspace na Sandbox",
              description: "Caminho mapeado como raiz dentro do ambiente isolado.",
            },
            prune: {
              title: "Limpeza (Pruning)",
              idleHours: {
                title: "Horas Ociosas para Remoção",
                description: "Horas de inatividade antes de remover container.",
              },
              maxAgeDays: {
                title: "Idade Máxima (dias)",
                description: "Idade máxima do container em dias.",
              },
            },
          },
          blockStreamingDefault: {
            title: "Bloquear Streaming (Padrão)",
            description: "Habilitar bloqueio de streaming por padrão.",
          },
          blockStreamingBreak: {
            title: "Quebra de Bloqueio de Streaming",
            description:
              "Define o ponto de interrupção do streaming (fim do texto ou fim da mensagem).",
          },
          blockStreamingChunk: {
            title: "Fragmento de Bloqueio de Streaming",
            description: "Configurações de fragmentação quando o streaming está bloqueado.",
            breakPreference: {
              title: "Preferência de Quebra",
              description: "Onde preferir quebrar o texto (parágrafo, nova linha ou frase).",
            },
            maxChars: {
              title: "Máximo de Caracteres",
              description: "Limite de caracteres por fragmento.",
            },
          },
          compaction: {
            title: "Compactação",
            description: "Configurações de gerenciamento e compactação de histórico.",
            mode: {
              title: "Modo",
              description: "Modo de compactação (Padrão ou Salvaguarda).",
            },
            maxHistoryShare: {
              title: "Participação Máxima do Histórico",
              description: "Fração máxima do contexto que o histórico pode ocupar.",
            },
            reserveTokensFloor: {
              title: "Mínimo de Tokens de Reserva",
              description: "Tokens mínimos mantidos livres para a próxima resposta.",
            },
            memoryFlush: {
              title: "Limpeza de Memória (Memory Flush)",
              description: "Configurações para liberar memória contextual.",
              enabled: { title: "Habilitado", description: "Ativar limpeza de memória." },
              softThresholdTokens: {
                title: "Limite Flexível de Tokens",
                description: "Limite de tokens antes de disparar a limpeza.",
              },
            },
          },
          contextPruning: {
            title: "Poda de Contexto (Context Pruning)",
            description: "Configurações para remover informações irrelevantes do contexto.",
            softTrim: {
              title: "Corte Flexível (Soft Trim)",
              description: "Remover partes do contexto para economizar espaço.",
              maxChars: {
                title: "Máximo de Caracteres",
                description: "Máximo de caracteres a manter após corte flexível.",
              },
              headChars: {
                title: "Caracteres do Início",
                description: "Caracteres a preservar no início.",
              },
              tailChars: {
                title: "Caracteres do Fim",
                description: "Caracteres a preservar no fim.",
              },
            },
            hardClear: {
              title: "Limpeza Total (Hard Clear)",
              description: "Limpar o contexto completamente se necessário.",
              enabled: { title: "Habilitado", description: "Habilitar limpeza total de contexto." },
              placeholder: {
                title: "Texto Substituto",
                description: "Texto para substituir conteúdo limpo.",
              },
            },
            softTrimRatio: {
              title: "Razão de Corte Flexível",
              description: "Razão de contexto para corte flexível.",
            },
            hardClearRatio: {
              title: "Razão de Limpeza Total",
              description: "Limite de razão para limpeza total de contexto.",
            },
            ttl: {
              title: "TTL",
              description: "Tempo de vida (Time To Live) para o cache de poda de contexto.",
            },
            keepLastAssistants: {
              title: "Manter Últimas Respostas",
              description: "Número de mensagens do assistente a preservar.",
            },
            minPrunableToolChars: {
              title: "Mínimo de Caracteres Podáveis (Ferramentas)",
              description: "Tamanho mínimo da saída de ferramenta para ser podável.",
            },
          },
          humanDelay: {
            title: "Atraso Humano",
            description: "Simula tempo de resposta humano para parecer mais natural.",
            mode: {
              title: "Modo",
              description: "Modo de atraso (Desligado, Natural ou Personalizado).",
            },
            minMs: {
              title: "Mínimo (ms)",
              description: "Tempo mínimo de espera em milissegundos.",
            },
            maxMs: {
              title: "Máximo (ms)",
              description: "Tempo máximo de espera em milissegundos.",
            },
          },
          cliBackends: {
            title: "Backends CLI",
            description: "Configurações de execução de comandos (bash, python, etc.).",
          },
          memorySearch: {
            title: "Busca em Memória",
            description:
              "Busca vetorial em MEMORY.md e memory/*.md (suporta substituições por agente).",
            enabled: {
              title: "Habilitado",
              description: "Ativar busca vetorial em memória.",
            },
            provider: {
              title: "Provedor de Vetores",
              description: "Serviço usado para busca vetorial (ex: local, remote).",
            },
            sources: {
              title: "Fontes de Busca",
              description: "Diretórios ou arquivos indexados para busca.",
            },
            extraPaths: {
              title: "Caminhos de Memória Extras",
              description: "Caminhos adicionais para incluir na busca (.md ou diretórios).",
            },
            model: {
              title: "Modelo de Embedding",
              description: "Modelo usado para converter texto em vetores.",
            },
            local: {
              modelPath: {
                title: "Caminho do Modelo Local",
                description: "Caminho para o arquivo GGUF local ou URI hf: (node-llama-cpp).",
              },
              modelCacheDir: {
                title: "Diretório de Cache do Modelo",
                description: "Diretório local para armazenar modelos de embedding (opcional).",
              },
            },
            fallback: {
              title: "Fallback de Busca em Memória",
              description: "Provedor alternativo se o principal falhar.",
            },
            experimental: {
              sessionMemory: {
                title: "Indexação de Sessão (Experimental)",
                description: "Habilitar indexação experimental das transcrições das sessões.",
              },
            },
            cache: {
              enabled: {
                title: "Cache de Embeddings",
                description: "Habilitar cache de embeddings.",
              },
              maxEntries: {
                title: "Máximo de Entradas no Cache",
                description: "Limite opcional de embeddings em cache.",
              },
            },
            chunking: {
              title: "Fragmentação",
              tokens: {
                title: "Tokens de Fragmento de Memória",
                description: "Tamanho de cada fragmento indexado.",
              },
              overlap: {
                title: "Sobreposição de Fragmentos",
                description: "Número de tokens que se sobrepõem entre fragmentos.",
              },
            },
            query: {
              maxResults: {
                title: "Máximo de Resultados",
                description: "Máximo de resultados de busca a retornar.",
              },
              minScore: {
                title: "Pontuação Mínima",
                description: "Pontuação mínima de relevância para resultados.",
              },
              hybrid: {
                enabled: {
                  title: "Habilitado",
                  description: "Habilitar busca híbrida vetor + texto.",
                },
                vectorWeight: {
                  title: "Peso Vetorial",
                  description: "Peso para similaridade vetorial no ranking.",
                },
                textWeight: {
                  title: "Peso Textual",
                  description: "Peso para correspondência de texto no ranking.",
                },
                candidateMultiplier: {
                  title: "Multiplicador de Candidatos",
                  description: "Multiplicador para tamanho do pool de candidatos.",
                },
              },
            },
            sync: {
              onSearch: {
                title: "Indexar na Busca (Lazy)",
                description:
                  "Sincronização preguiçosa: agendar reindexação na busca após alterações.",
              },
              onSessionStart: {
                title: "Indexar ao Iniciar Sessão",
                description: "Iniciar indexação quando uma sessão começar.",
              },
              intervalMinutes: {
                title: "Intervalo (Minutos)",
                description: "Minutos entre operações de sincronização.",
              },
              watch: {
                title: "Observar Arquivos",
                description: "Observar mudanças de arquivos para disparar sincronização.",
              },
              watchDebounceMs: {
                title: "Debounce de Observação (ms)",
                description: "Tempo de espera (debounce) para atualizações de observação.",
              },
              sessions: {
                deltaMessages: {
                  title: "Mensagens Delta",
                  description: "Contagem de mensagens para disparar reindex de sessão.",
                },
                deltaBytes: {
                  title: "Bytes Delta",
                  description: "Contagem de bytes para disparar reindex de sessão.",
                },
              },
            },
            store: {
              title: "Armazenamento",
              description: "Configuração de persistência do índice vetorial.",
              driver: {
                title: "Driver",
                description: "Tipo de banco de dados (sqlite).",
              },
              path: {
                title: "Caminho do Índice",
                description: "Caminho para o índice de busca de memória.",
              },
              vector: {
                extensionPath: {
                  title: "Caminho da Extensão Vetorial",
                  description: "Caminho para extensão de banco de dados vetorial.",
                },
              },
            },
            remote: {
              batch: {
                concurrency: {
                  title: "Concorrência em Lote Remoto",
                  description: "Máximo de tarefas simultâneas de indexação em lote.",
                },
                pollIntervalMs: {
                  title: "Intervalo de Polling (ms)",
                  description: "Frequência de verificação do status do lote.",
                },
                timeoutMinutes: {
                  title: "Timeout de Lote (minutos)",
                  description: "Tempo máximo para indexação em lote.",
                },
                wait: {
                  title: "Aguardar Lote",
                  description: "Esperar a conclusão do lote durante a indexação.",
                },
              },
              headers: {
                title: "Cabeçalhos de Embedding Remotos",
                description: "Cabeçalhos extras (ex: autenticação) para embeddings remotos.",
              },
            },
          },
        },
        list: {
          title: "Lista",
          description: "Configurações individuais por agente.",
          "*": {
            mode: { title: "Modo", description: "Modo de operação do agente." },
            accountId: {
              title: "ID da Conta",
              description: "Identificador único da conta do agente.",
            },
            ackMaxChars: {
              title: "Máximo de Caracteres Ack",
              description: "Limite de caracteres para mensagens de confirmação.",
            },
            activeHours: {
              title: "Horário de Atividade",
              description: "Define quando o agente está ativo.",
              start: { title: "Início", description: "Hora de início (formato HH:MM)." },
              end: { title: "Fim", description: "Hora de término (formato HH:MM)." },
              timezone: {
                title: "Fuso Horário",
                description: "Fuso horário para o horário de atividade.",
              },
            },
            every: {
              title: "Frequência (Every)",
              description: "Intervalo de execução (ex: 5m, 1h).",
            },
            includeReasoning: {
              title: "Incluir Raciocínio",
              description: "Incluir cadeia de pensamento nas respostas.",
            },
            model: { title: "Modelo", description: "Modelo de IA para este agente." },
            session: { title: "Sessão", description: "Configuração de sessão do agente." },
            target: {
              title: "Alvo (Target)",
              description: "Alvo de entrega ('Último', 'Nenhum' ou ID de canal).",
            },
            to: { title: "Para (To)", description: "Destinatário da mensagem." },
            humanDelay: {
              title: "Atraso Humano",
              description: "Configuração de atraso para simular resposta humana.",
            },
            imageModel: {
              title: "Modelo de Imagem",
              description: "Modelo para geração/análise de imagens.",
            },
            memorySearch: {
              title: "Busca em Memória",
              description: "Busca vetorial em MEMORY.md e memory/*.md (substituições por agente).",
              query: {
                maxResults: {
                  title: "Máximo de Resultados",
                  description: "Máximo de resultados de busca para este agente.",
                },
                minScore: {
                  title: "Pontuação Mínima",
                  description: "Pontuação mínima de relevância para resultados.",
                },
                hybrid: {
                  enabled: {
                    title: "Habilitado",
                    description: "Habilitar busca híbrida para este agente.",
                  },
                  vectorWeight: {
                    title: "Peso Vetorial",
                    description: "Peso de similaridade vetorial.",
                  },
                  textWeight: {
                    title: "Peso Textual",
                    description: "Peso de correspondência de texto.",
                  },
                  candidateMultiplier: {
                    title: "Multiplicador de Candidatos",
                    description: "Multiplicador de pool de candidatos.",
                  },
                },
              },
            },
            groupChat: {
              title: "Chat em Grupo",
              description: "Configurações específicas para interação em grupos.",
            },
            sandbox: {
              title: "Sandbox Personalizada",
              description: "Substituições de sandbox para este agente.",
              docker: {
                title: "Configurações Docker",
                seccompProfile: {
                  title: "Perfil Seccomp",
                  description: "Perfil Seccomp para sandbox deste agente.",
                },
                apparmorProfile: {
                  title: "Perfil Apparmor",
                  description: "Perfil AppArmor para sandbox deste agente.",
                },
                pidsLimit: {
                  title: "Limite de PIDs",
                  description: "Limite de processos para sandbox deste agente.",
                },
                ulimits: {
                  title: "Ulimits",
                  description: "Limites de recursos para sandbox deste agente.",
                },
                memory: {
                  title: "Memória",
                  description: "Limite de memória para sandbox deste agente.",
                },
                memorySwap: {
                  title: "Swap de Memória",
                  description: "Limite de swap para sandbox deste agente.",
                },
                autoStartTimeoutMs: {
                  title: "Tempo Limite de Início Automático (ms)",
                  description: "Timeout de auto-início para este agente.",
                },
                allowHostControl: {
                  title: "Permitir Controle do Host",
                  description: "Permitir controle de host para este agente.",
                },
              },
              browser: {
                title: "Navegador na Sandbox",
                vncPort: {
                  title: "Porta VNC",
                  description: "Porta VNC para navegador deste agente.",
                },
                noVncPort: {
                  title: "Porta noVNC",
                  description: "Porta noVNC para navegador deste agente.",
                },
                enableNoVnc: {
                  title: "Habilitar noVNC",
                  description: "Habilitar noVNC para este agente.",
                },
              },
            },
            skills: {
              title: "Filtro de Skills",
              description: "Skills permitidas para este agente.",
            },
            tools: {
              profile: {
                title: "Perfil de Ferramentas",
                description: "Perfil de ferramentas para este agente.",
              },
              alsoAllow: {
                title: "Também Permitir",
                description: "Ferramentas adicionais permitidas.",
              },
              byProvider: {
                title: "Política por Provedor",
                description: "Políticas de ferramentas específicas por provedor.",
              },
            },
            identity: {
              avatar: { title: "Avatar", description: "URL do avatar para este agente." },
            },
            thinking: {
              title: "Racio. Padrão (Thinking)",
              description: "Nível de raciocinio padrão para este agente.",
            },
            thinking_default: {
              title: "Racio. Padrão (Thinking)",
              description: "Nível de raciocinio padrão para este agente.",
            },
            thinkingDefault: {
              title: "Racio. Padrão (Thinking)",
              description: "Nível de raciocinio padrão para este agente.",
            },
          },
        },
      },
      auth: {
        profiles: {
          title: "Perfis de Autenticação",
          description: "Perfis individuais de autenticação contendo chaves de API.",
        },
        order: {
          title: "Ordem de Perfis",
          description: "Ordem de preferência para o uso de perfis de autenticação.",
        },
        cooldowns: {
          title: "Intervalos de Cooldown",
          description: "Intervalos de tempo para esperas em caso de falha ou limites de cobrança.",
          billingBackoffHours: {
            title: "Backoff de Cobrança (horas)",
            description: "Horas de espera após erro de cobrança.",
          },
          billingBackoffHoursByProvider: {
            title: "Backoff por Provedor",
            description: "Tempos de backoff de cobrança por provedor.",
          },
          billingMaxHours: {
            title: "Máximo de Backoff (horas)",
            description: "Duração máxima de backoff de cobrança.",
          },
          failureWindowHours: {
            title: "Janela de Falha (horas)",
            description: "Janela para contar falhas.",
          },
        },
      },
      plugins: {
        title: "Plugins",
        description: "Gerenciamento de plugins e extensões.",
        enabled: {
          title: "Habilitar Plugins",
          description: "Habilitar o carregamento de plugins/extensões (padrão: true).",
        },
        allow: {
          title: "Lista de Permissão de Plugins",
          description:
            "Lista opcional de IDs de plugins permitidos; quando definida, apenas os plugins listados são carregados.",
        },
        deny: {
          title: "Lista de Bloqueio de Plugins",
          description:
            "Lista de bloqueio opcional de IDs de plugins; o bloqueio tem precedência sobre a lista de permissão.",
        },
        load: {
          title: "Carregar",
          description:
            "Caminhos adicionais de arquivos ou diretórios de plugins a serem carregados.",
          paths: {
            title: "Caminhos de Carregamento",
            description: "Caminhos de arquivos ou diretórios para carregar plugins.",
          },
        },
        slots: {
          title: "Slots de Plugins",
          description: "Selecione quais plugins possuem slots exclusivos (memória, etc.).",
          memory: {
            title: "Plugin de Memória",
            description:
              'Selecione o plugin de memória ativo por ID, ou "none" para desativar plugins de memória.',
          },
        },
        entries: {
          title: "Entradas de Plugins",
          description:
            "Configurações individuais de plugins por ID (habilitar/desativar + payloads de configuração).",
          "*": {
            enabled: {
              title: "Plugin Habilitado",
              description:
                "Substitui a ativação/desativação do plugin para esta entrada (requer reinicialização).",
            },
            config: {
              title: "Configuração do Plugin",
              description:
                "Payload de configuração definido pelo plugin (o esquema é fornecido pelo plugin).",
            },
          },
        },
        installs: {
          title: "Registros de Instalação",
          description:
            "Metadados de instalação gerenciados via CLI (usados para localizar fontes de instalação).",
          "*": {
            source: {
              title: "Fonte",
              description: 'Fonte de instalação ("NPM", "Arquivo" ou "Caminho").',
            },
            spec: {
              title: "Especificação",
              description: "Especificação npm original usada para instalação (se a fonte for npm).",
            },
            sourcePath: {
              title: "Caminho Fonte",
              description: "Arquivo ou caminho original usado para instalação (se houver).",
            },
            installPath: {
              title: "Caminho de Instalação",
              description: "Diretório de instalação resolvido.",
            },
            version: {
              title: "Versão",
              description: "Versão registrada no momento da instalação (se disponível).",
            },
            installedAt: {
              title: "Instalado Em",
              description: "Data e hora ISO da última instalação/atualização.",
            },
          },
        },
      },
      media: {
        preserveFilenames: {
          title: "Preservar Nomes de Arquivos",
          description: "Manter nomes de arquivos originais ao processar mídia.",
        },
      },
      logging: {
        level: {
          title: "Nível de Log (Arquivo)",
          description: "Nível mínimo de severidade para mensagens gravadas no arquivo de log.",
        },
        file: { title: "Caminho do Arquivo de Log", description: "Caminho para o arquivo de log." },
        consoleLevel: {
          title: "Nível de Log (Console)",
          description: "Nível mínimo de severidade para mensagens no console.",
        },
        consoleStyle: {
          title: "Estilo do Console",
          description: "Estilo de formatação para saída do console.",
        },
        redactSensitive: {
          title: "Ocultar Dados Sensíveis",
          description: "Ocultar informações sensíveis nos logs.",
        },
        redactPatterns: {
          title: "Padrões de Ocultação (Regex)",
          description: "Padrões regex adicionais para ocultar dados.",
        },
      },
      models: {
        mode: {
          title: "Modo de Modelos",
          description:
            "Como os modelos configurados interagem com os padrões (mesclar ou substituir).",
        },
        providers: {
          title: "Provedores de Modelos",
          description: "Provedores de modelos IA configurados.",
        },
        slots: {
          title: "Slots de Modelos",
          description: "Slots disponíveis para roteamento de modelos.",
        },
        bedrockDiscovery: {
          title: "Descoberta AWS Bedrock",
          description: "Descoberta automática de modelos do AWS Bedrock.",
          enabled: {
            title: "Habilitado",
            description: "Habilitar descoberta automática de modelos do Bedrock.",
          },
          region: {
            title: "Região AWS",
            description: "Região AWS para chamadas de API do Bedrock.",
          },
          providerFilter: {
            title: "Filtro de Provedor",
            description: "Filtrar modelos descobertos por nome do provedor.",
          },
          refreshInterval: {
            title: "Intervalo de Atualização",
            description: "Segundos entre atualizações de descoberta.",
          },
          defaultContextWindow: {
            title: "Janela de Contexto Padrão",
            description: "Janela de contexto padrão para modelos descobertos.",
          },
          defaultMaxTokens: {
            title: "Máximo de Tokens Padrão",
            description: "Máximo de tokens de saída padrão para modelos descobertos.",
          },
        },
      },
      bindings: {
        watch: {
          title: "Observar Atalhos",
          description: "Monitorar alterações nos atalhos de teclado.",
        },
        watchDebounceMs: {
          title: "Debounce de Observação (ms)",
          description: "Tempo de espera (debounce) para atualizações de atalhos.",
        },
      },
      broadcast: {
        enabled: {
          title: "Transmissão Habilitada",
          description: "Habilitar transmissão para múltiplos tópicos.",
        },
        topic: { title: "Tópico de Transmissão", description: "Tópico padrão para notificações." },
        strategy: {
          title: "Estratégia de Transmissão",
          description: "Estratégia de execução para transmissões (paralela ou sequencial).",
        },
      },
      audio: {
        modelId: {
          title: "ID do Modelo de Áudio",
          description: "ID do modelo usado para processamento de áudio.",
        },
        apiKey: {
          title: "Chave de API de Áudio",
          description: "Chave de API para o provedor de áudio.",
        },
        transcription: {
          title: "Transcrição de Áudio",
          description: "Configurações para converter mensagens de áudio em texto.",
          command: {
            title: "Comando de Transcrição",
            description: "Comando personalizado para transcrição de áudio.",
          },
          timeoutSeconds: {
            title: "Timeout (segundos)",
            description: "Tempo máximo para o processo de transcrição.",
          },
        },
      },
      approvals: {
        mode: {
          title: "Modo de Aprovação",
          description: "Política para aprovações de comandos e ferramentas.",
        },
        timeoutMs: {
          title: "Tempo Limite de Aprovação (ms)",
          description: "Duração de uma solicitação de aprovação.",
        },
        exec: {
          title: "Aprovações de Execução",
          description:
            "Configurações para encaminhar solicitações de aprovação de execução para outros canais.",
          enabled: {
            title: "Habilitado",
            description: "Habilitar encaminhamento de solicitações de aprovação de execução.",
          },
          mode: { title: "Modo", description: "Modo de encaminhamento (Sessão, Alvos ou Ambos)." },
          agentFilter: {
            title: "Filtro de Agentes",
            description: "Lista de IDs de agentes para filtrar aprovações.",
          },
          sessionFilter: {
            title: "Filtro de Sessões",
            description: "Lista de chaves de sessão para filtrar aprovações.",
          },
          targets: {
            title: "Alvos",
            description: "Lista de canais alvo para encaminhamento de aprovações.",
          },
        },
      },
      cron: {
        enabled: {
          title: "Agendamento Habilitado",
          description: "Habilitar o agendador de tarefas interno.",
        },
        store: {
          title: "Caminho do Banco Cron",
          description: "Caminho para o banco de dados de tarefas agendadas.",
        },
        maxConcurrentRuns: {
          title: "Máximo de Execuções Simultâneas",
          description: "Limite de tarefas cron simultâneas.",
        },
      },
      web: {
        enabled: {
          title: "Servidor Web Habilitado",
          description: "Habilitar o servidor HTTP e WebSocket do gateway.",
        },
        heartbeatSeconds: {
          title: "Intervalo de Heartbeat (seg)",
          description: "Intervalo para sinais de presença (heartbeat).",
        },
        reconnect: {
          title: "Reconexão",
          description: "Configurações de backoff e tentativas para reconectar ao gateway.",
          initialMs: {
            title: "Atraso Inicial (ms)",
            description: "Atraso de backoff inicial em milissegundos.",
          },

          maxMs: {
            title: "Atraso Máximo (ms)",
            description: "Atraso máximo de backoff em milissegundos.",
          },
          factor: {
            title: "Fator de Crescimento",
            description: "Fator multiplicador para backoff exponencial.",
          },
          jitter: {
            title: "Jitter",
            description: "Randomização para evitar sincronização de reconexões.",
          },
          maxAttempts: {
            title: "Máximo de Tentativas",
            description: "Limite de tentativas para reconexões.",
          },
        },
      },
      canvasHost: {
        enabled: {
          title: "Habilitar Hospedagem de Canvas",
          description: "Habilitar o servidor de aplicações Canvas integrado.",
        },
        root: {
          title: "Diretório Raiz do Canvas",
          description: "Diretório para os arquivos estáticos do Canvas.",
        },
        port: {
          title: "Porta do Canvas",
          description: "Porta para o serviço de hospedagem do Canvas.",
        },
        liveReload: {
          title: "Recarga ao Vivo (Live Reload)",
          description: "Atualizar a interface automaticamente ao alterar arquivos.",
        },
      },
      browser: {
        enabled: {
          title: "Navegador Habilitado",
          description: "Habilitar recursos de automação de navegador.",
        },
        evaluateEnabled: {
          title: "Habilitar Execução de Script (Evaluate)",
          description: "Permitir a execução de scripts personalizados no navegador.",
        },
        cdpUrl: {
          title: "URL CDP",
          description: "URL do Chrome DevTools Protocol para conexão remota do navegador.",
        },
        color: {
          title: "Cor do Navegador",
          description: "Cor de destaque para elementos da UI do navegador.",
        },
        executablePath: {
          title: "Caminho do Executável",
          description: "Caminho para o executável do navegador.",
        },
        headless: {
          title: "Modo Headless",
          description: "Executar navegador sem interface visual.",
        },
        noSandbox: {
          title: "Sem Sandbox",
          description: "Desabilitar sandbox do navegador (use com cautela).",
        },
        attachOnly: {
          title: "Apenas Anexar",
          description: "Apenas anexar a instâncias de navegador existentes, não iniciar novas.",
        },
        defaultProfile: {
          title: "Perfil Padrão",
          description: "Perfil de navegador padrão a ser usado.",
        },
        snapshotDefaults: {
          title: "Snapshots Padrão",
          description: "Configurações padrão para snapshots de páginas do navegador.",
          mode: {
            title: "Modo de Snapshot Padrão",
            description: "Modo inicial para capturas (snapshots) do navegador.",
          },
        },
        profiles: {
          title: "Perfis de Navegador",
          description: "Perfis de navegador nomeados com configurações CDP personalizadas.",
          "*": {
            cdpPort: {
              title: "Porta CDP",
              description: "Porta do Chrome DevTools Protocol para este perfil.",
            },
            cdpUrl: {
              title: "URL CDP",
              description: "URL do Chrome DevTools Protocol para este perfil.",
            },
            driver: {
              title: "Driver",
              description: "Tipo de driver do navegador (clawd ou extension).",
            },
            color: {
              title: "Cor do Perfil",
              description: "Cor de destaque para este perfil de navegador.",
            },
          },
        },
        remoteCdpTimeoutMs: {
          title: "Timeout CDP Remoto (ms)",
          description: "Tempo limite para conexões CDP remotas.",
        },
        remoteCdpHandshakeTimeoutMs: {
          title: "Timeout Handshake CDP (ms)",
          description: "Tempo limite para o aperto de mão (handshake) inicial do CDP.",
        },
      },
      session: {
        scope: { title: "Escopo da Sessão", description: "Alcance de visibilidade da sessão." },
        dmScope: { title: "Escopo de Sessão DM", description: "Escopo para mensagens diretas." },
        idleMinutes: {
          title: "Minutos de Inatividade",
          description: "Minutos antes da sessão ser considerada inativa.",
        },
        store: {
          title: "Caminho de Armazenamento",
          description: "Caminho para os dados de persistência da sessão.",
        },
        typingIntervalSeconds: {
          title: "Intervalo de Digitação (seg)",
          description: "Intervalo para atualizações do indicador de digitação.",
        },
        typingMode: {
          title: "Modo de Digitação",
          description: "Como os indicadores de digitação são manipulados.",
        },
        mainKey: { title: "Chave Principal", description: "Identificador primário da sessão." },
        agentToAgent: {
          title: "Agente para Agente",
          description: "Configurações para comunicação direta entre agentes.",
          maxPingPongTurns: {
            title: "Máximo de Turnos Agente-Agente",
            description: "Máximo de turnos diretos entre agentes.",
          },
        },
        identityLinks: {
          title: "Links de Identidade",
          description:
            "Mapear identidades de usuários entre diferentes canais (ex: vincular números de telefone a nomes de usuário).",
        },
        resetTriggers: {
          title: "Gatilhos de Reinício",
          description: "Padrões que disparam um reinício de sessão quando correspondidos.",
        },
        reset: { title: "Reiniciar Sessão", description: "Condições para o reinício da sessão." },
        resetByType: {
          title: "Reiniciar por Tipo",
          description: "Reiniciar a sessão com base no tipo de mensagem.",
        },
        resetByChannel: {
          title: "Reiniciar por Canal",
          description: "Configurações de reinício de sessão específicas por canal.",
        },
        sendPolicy: {
          title: "Política de Envio",
          description: "Regras para a entrega de mensagens.",
        },
      },
      talk: {
        voiceId: { title: "ID da Voz", description: "Voz específica para usar na síntese." },
        voiceAliases: {
          title: "Aliases de Voz",
          description: "Mapeamentos para nomes amigáveis de vozes.",
        },
        modelId: { title: "ID do Modelo", description: "Modelo usado para geração de fala." },
        outputFormat: { title: "Formato de Saída", description: "Formato do áudio gerado." },
        apiKey: { title: "Chave de API", description: "Chave de API para o provedor de voz." },
        interruptOnSpeech: {
          title: "Interromper ao Falar",
          description: "Parar o áudio quando o usuário começar a falar.",
        },
      },
      nodeHost: {
        browserProxy: {
          title: "Proxy de Navegador",
          description: "Configuração para acesso de proxy de navegador deste node host.",
          enabled: {
            title: "Habilitar Proxy de Navegador",
            description: "Permitir que o proxy de navegador seja usado por este host.",
          },
          allowProfiles: {
            title: "Perfis de Navegador Permitidos",
            description: "Lista de IDs de perfis de navegador que podem ser acessados.",
          },
        },
      },
      discovery: {
        wideArea: {
          title: "Rede de Longa Distância",
          description: "Habilitar descoberta em redes de longa distância.",
        },
        mdns: {
          title: "mDNS",
          description: "Descoberta de DNS multicast para peers na rede local.",
          mode: {
            title: "Modo mDNS",
            description: "Modo de descoberta para DNS multicast (mDNS).",
          },
        },
      },
      skills: {
        allowBundled: {
          title: "Lista de Permissão de Skills Integradas",
          description:
            "Lista de permissão opcional apenas para skills integradas. Quando definida, apenas as skills integradas listadas são elegíveis.",
        },
        entries: {
          title: "Entradas de Skills",
          description:
            "Configurações individuais de skills por ID (ativar/desativar + chaves de API e configuração).",
          "*": {
            enabled: {
              title: "Skill Habilitada",
              description: "Substituir se esta skill está ativada.",
            },
            apiKey: {
              title: "Chave de API",
              description: "Chave de API para esta skill (se necessário).",
            },
            env: {
              title: "Variáveis de Ambiente",
              description: "Variáveis de ambiente personalizadas para esta skill.",
            },
            config: {
              title: "Configuração da Skill",
              description: "Payload de configuração personalizado para esta skill.",
            },
          },
        },
        install: {
          title: "Instalação de Skills",
          description: "Configurações para instalar dependências de skills.",
          preferBrew: {
            title: "Preferir Homebrew",
            description: "Preferir Homebrew em vez de outros gerenciadores de pacotes ao instalar.",
          },
          nodeManager: {
            title: "Gerenciador de Pacotes Node",
            description: "Gerenciador de pacotes Node a usar (npm, pnpm, yarn, bun).",
          },
        },
        load: {
          title: "Carregamento de Skills",
          description: "Configurações para carregar skills do sistema de arquivos.",
          extraDirs: {
            title: "Diretórios Extras",
            description: "Diretórios adicionais para carregar skills.",
          },
          watch: {
            title: "Observar Alterações",
            description: "Recarregar skills automaticamente ao alterar arquivos.",
          },
          watchDebounceMs: {
            title: "Debounce de Observação (ms)",
            description: "Tempo de espera antes de recarregar as skills.",
          },
        },
      },
    },
  },

  // Logs View
  logs: {
    title: "Logs",
    subtitle: "Logs de arquivo do Gateway (JSONL).",
    export: "Exportar {{label}}",
    filter: "Filtrar",
    searchPlaceholder: "Buscar logs",
    autoFollow: "Auto-seguir",
    file: "Arquivo: {{path}}",
    truncated: "Saída de log truncada; mostrando trecho mais recente.",
    noEntries: "Sem entradas de log.",
    filtered: "Filtrado",
    visible: "Visível",
  },

  // Slack View
  slack: {
    subtitle: "Status do modo Socket e configuração do canal.",
  },

  // Sessions View
  sessions: {
    title: "Sessões",
    subtitle: "Chaves de sessão ativas e substituições por sessão.",
    activeWithin: "Ativo em (minutos)",
    limit: "Limite",
    includeGlobal: "Incluir global",
    includeUnknown: "Incluir desconhecido",
    store: "Armazenamento: {{path}}",
    noSessions: "Nenhuma sessão encontrada.",
    key: "Chave",
    label: "Rótulo",
    kind: "Tipo",
    updated: "Atualizado",
    tokens: "Tokens",
    thinking: "Pensamento",
    verbose: "Verbosidade",
    reasoning: "Raciocínio",
    optional: "Opcional",
    inherit: "Usar padrão",
    multiple: "(múltiplos)",
    kinds: {
      direct: "Direto",
      global: "Global",
      isolated: "Isolado",
      group: "Grupo",
      unknown: "Desconhecido",
    },
    off: "Desligado",
    minimal: "Mínimo",
    low: "Baixo",
    medium: "Médio",
    high: "Alto",
    xhigh: "Muito alto",
    full: "Completo",
    on: "Ligado",
    offExplicit: "Desligado (explícito)",
    stream: "Fluxo",
    custom: "{{name}} (Personalizado)",
  },

  // Markdown Sidebar
  markdown: {
    toolOutput: "Saída da Ferramenta",
    closeSidebar: "Fechar barra lateral",
    viewRawText: "Ver texto bruto",
    noContent: "Sem conteúdo disponível",
  },

  // Skills View
  skills: {
    messages: {
      enabled: "Skill ativada",
      disabled: "Skill desativada",
      apiKeySaved: "Chave de API salva",
      installed: "Instalada",
    },
    title: "Skills",
    subtitle: "Skills integradas, gerenciadas e do workspace.",
    filter: "Filtrar",
    searchPlaceholder: "Buscar skills",
    shown: "{{count}} exibido(s)",
    noSkills: "Nenhuma skill encontrada.",
    groups: {
      workspace: "Skills do Workspace",
      builtIn: "Skills Integradas",
      installed: "Skills Instaladas",
      extra: "Skills Extras",
      other: "Outras Skills",
    },
    status: {
      bundled: "Integrada",
      eligible: "Elegível",
      blocked: "Bloqueada",
      disabled: "Desativada",
      blockedByAllowlist: "Bloqueada pela lista de permissão",
    },
    installAction: "Instalar",
    skillDescriptions: {
      "1password":
        "Configure e use a CLI do 1Password (op). Use para gerenciar segredos e autenticação.",
      github: "Interaja com o GitHub via CLI gh (issues, PRs, runs e API).",
      discord: "Integração com Discord para gerenciar canais e mensagens.",
      slack: "Controle o Slack (mensagens, reações, pins) via OpenClaw.",
      gemini: "Acesse modelos Google Gemini para chat e visão.",
      notion: "Gerencie páginas e bancos de dados do Notion.",
      trello: "Gerencie quadros, listas e cartões do Trello.",
      obsidian: "Interaja com seus cofres (vaults) do Obsidian.",
      "openai-image-gen": "Geração de imagens via API OpenAI com galeria HTML.",
      "shared-sessions": "Gerencie sessões compartilhadas entre diferentes instâncias.",
      camsnap: "Capture fotos da câmera do sistema via CLI.",
      ordercli: "Gerencie pedidos Foodora (histórico, status e reordenação).",
      "voice-call": "Inicie chamadas de voz via plugin de chamadas do OpenClaw.",
      sag: "ElevenLabs TTS com estilo de UX 'say' do Mac.",
      "sherpa-onnx-tts": "Texto-para-fala (TTS) local via sherpa-onnx (offline).",
      goplaces: "CLI Moderna da Google Places API.",
      canvas: "Exiba conteúdo HTML em nodes conectados (Mac, iOS, Android).",
      weather: "Informações meteorológicas e previsões.",
      "openai-whisper": "Transcrição de áudio local usando o modelo Whisper da OpenAI.",
      summarize: "Resuma textos longos, documentos ou páginas web.",
      "session-logs": "Verifique e pesquise logs de conversas anteriores.",
      "coding-agent": "Habilidades de codificação assistida para o agente.",
      "apple-notes": "Acesse e gerencie suas Notas da Apple (macOS).",
      "apple-reminders": "Gerencie seus Lembretes da Apple (macOS).",
      "openai-whisper-api": "Transcrição de áudio via API Whisper da OpenAI (nuvem).",
      "local-places": "Busca de lugares locais e informações detalhadas.",
      "food-order":
        "CLI exclusiva do Foodora para verificar pedidos passados e status de pedidos ativos (Deliveroo em desenvolvimento).",
      "spotify-player": "Controle sua reprodução do Spotify.",
      tmux: "Gerencie sessões e janelas do tmux.",
      "skill-creator": "Crie e gerencie novas skills para o OpenClaw.",
      eightctl: "Controle pods Eight Sleep (status, temperatura, alarmes, agendamentos).",
      gifgrep: "Busque GIFs via CLI/TUI, baixe resultados e extraia quadros ou folhas de contato.",
      wacli:
        "Envie mensagens do WhatsApp para outras pessoas ou pesquise/sincronize o histórico do WhatsApp via CLI wacli (não para chats normais de usuário).",
      "video-frames": "Extraia quadros ou clipes curtos de vídeos usando ffmpeg.",
      "things-mac":
        "Gerencie o Things 3 via CLI `things` no macOS (adicione/atualize projetos e tarefas via URL scheme; leia/pesquise/liste do banco de dados local do Things).",
      sonoscli: "Controle alto-falantes Sonos (descobrir/status/reproduzir/volume/grupo).",
      songsee:
        "Gere espectrogramas e visualizações de painel de recursos a partir de áudio com a CLI songsee.",
      peekaboo: "Capture e automatize a interface do macOS com a CLI Peekaboo.",
      oracle:
        "Melhores práticas para o CLI oracle (prompt + empacotamento de arquivos, engines, sessões e padrões de anexo de arquivos).",
      openhue: "Controle luzes/cenas Philips Hue via CLI OpenHue.",
      "nano-pdf": "Edite PDFs com instruções em linguagem natural usando a CLI nano-pdf.",
      "nano-banana-pro": "Gere ou edite imagens via Gemini 3 Pro Image (Nano Banana Pro).",
      mcporter:
        "Use a CLI mcporter para listar, configurar, autenticar e chamar servidores/ferramentas MCP diretamente (HTTP ou stdio).",
      imsg: "CLI de iMessage/SMS para listar conversas, histórico, monitorar e enviar mensagens.",
      himalaya:
        "CLI para gerenciar e-mails via IMAP/SMTP. Use Himalaya para listar, ler, escrever, responder, encaminhar, buscar e organizar e-mails.",
      gog: "CLI do Google Workspace para Gmail, Agenda, Drive, Contatos, Planilhas e Documentos.",
      clawhub:
        "Use a CLI ClawHub para buscar, instalar, atualizar e publicar novas skills de agente a partir do clawhub.com.",
      bluebubbles:
        "Use para enviar ou gerenciar iMessages via BlueBubbles (integração recomendada). As chamadas passam pela ferramenta genérica de mensagens.",
      blucli: "CLI BluOS (blu) para descoberta, reprodução, agrupamento e volume.",
      blogwatcher:
        "Monitore blogs e feeds RSS/Atom em busca de atualizações usando a CLI blogwatcher.",
      bird: "CLI do X/Twitter para ler, buscar, postar e engajar via cookies.",
      "bear-notes": "Crie, pesquise e gerencie notas do Bear via CLI grizzly.",
      healthcheck:
        "Reforço de segurança do host e configuração de tolerância a riscos para implantações do OpenClaw. Use quando um usuário pedir auditorias de segurança, firewall/SSH/usuário.",
      "model-usage":
        "Use o uso de custo local da CLI CodexBar para resumir o uso por modelo para Codex ou Claude, incluindo o modelo atual ou um resumo completo.",
    },
    skillNames: {
      "1password": "1Password",
      github: "Github",
      discord: "Discord",
      slack: "Slack",
      gemini: "Gemini",
      notion: "Notion",
      trello: "Trello",
      obsidian: "Obsidian",
      "openai-image-gen": "Gerador de imagem OpenAI",
      "openai-whisper": "Whisper OpenAI local",
      "openai-whisper-api": "Whisper OpenAI API",
      "apple-notes": "Notas da Apple",
      "apple-reminders": "Lembretes da Apple",
      "bear-notes": "Notas do Bear",
      "voice-call": "Chamada de voz",
      "shared-sessions": "Sessões compartilhadas",
      "model-usage": "Uso de modelos",
      "video-frames": "Quadros de vídeo",
      camsnap: "Captura de câmera",
      summarize: "Resumidor",
      "skill-creator": "Criador de skills",
      "food-order": "Pedido de comida",
      "local-places": "Lugares locais",
      "spotify-player": "Player Spotify",
      "session-logs": "Logs de sessão",
      "coding-agent": "Agente de codificação",
      gog: "Google Workspace",
      weather: "Clima",
      healthcheck: "Segurança do sistema",
      wacli: "Wacli",
      eightctl: "Eightctl",
      gifgrep: "Gifgrep",
      sonoscli: "Sonoscli",
      songsee: "Songsee",
      mcporter: "Mcporter",
      imsg: "Imsg",
      blucli: "Blucli",
      bird: "Bird",
      clawhub: "Clawhub",
      himalaya: "Himalaya",
      peekaboo: "Peekaboo",
      openhue: "Openhue",
      "nano-pdf": "Nano PDF",
      "nano-banana-pro": "Nano Banana Pro",
      "things-mac": "Things Mac",
      sag: "Sag (ElevenLabs)",
      "sherpa-onnx-tts": "Sherpa ONNX TTS",
      goplaces: "Google Places",
      tmux: "Tmux",
      oracle: "Oracle",
      bluebubbles: "BlueBubbles",
      blogwatcher: "Blogwatcher",
      canvas: "Canvas",
      ordercli: "OrderCLI",
    },
    skillSources: {
      "openclaw-bundled": "Pacote OpenClaw",
      "openclaw-workspace": "Workspace OpenClaw",
      "openclaw-managed": "Gerenciado OpenClaw",
      "openclaw-extra": "Extra OpenClaw",
    },
    missingType: {
      bin: "Binário",
      env: "Variável",
      config: "Configuração",
      os: "SO",
    },
    missing: "Faltando: {{items}}",
    reason: "Motivo: {{items}}",
    enable: "Ativar",
    disable: "Desativar",
    installing: "Instalando…",
    apiKey: "Chave de API",
    saveKey: "Salvar chave",
    technicalNames: {
      // Channel configs
      "channels.bluebubbles": "Canal BlueBubbles",
      "channels.slack": "Canal Slack",
      "channels.telegram": "Canal Telegram",
      "channels.discord": "Canal Discord",
      "channels.whatsapp": "Canal WhatsApp",
      "channels.signal": "Canal Signal",
      "channels.imessage": "Canal iMessage",
      "channels.googlechat": "Canal Google Chat",
      "channels.nostr": "Canal Nostr",
      // Plugin configs
      "plugins.entries.voice-call.enabled": "Plugin de Chamada de Voz",
      // API Keys - Google
      GOOGLE_PLACES_API_KEY: "Chave API Google Places",
      GOOGLE_API_KEY: "Chave API Google",
      GEMINI_API_KEY: "Chave API Gemini",
      // API Keys - AI Providers
      OPENAI_API_KEY: "Chave API OpenAI",
      ANTHROPIC_API_KEY: "Chave API Anthropic",
      CLAUDE_API_KEY: "Chave API Claude",
      // API Keys - Other
      NOTION_API_KEY: "Chave API Notion",
      ELEVENLABS_API_KEY: "Chave API ElevenLabs",
      TRELLO_API_KEY: "Chave API Trello",
      TRELLO_TOKEN: "Token Trello",
      GITHUB_TOKEN: "Token GitHub",
      SLACK_TOKEN: "Token Slack",
      DISCORD_TOKEN: "Token Discord",
      TELEGRAM_BOT_TOKEN: "Token Bot Telegram",
      // Runtime dirs
      SHERPA_ONNX_RUNTIME_DIR: "Diretório Runtime Sherpa ONNX",
      SHERPA_ONNX_MODEL_DIR: "Diretório Modelos Sherpa ONNX",
    },
  },

  // Cron View
  cron: {
    cron: "Cron",
    errors: {
      invalidRunTime: "Horário de execução inválido.",
      invalidIntervalAmount: "Intervalo inválido.",
      expressionRequired: "Expressão cron obrigatória.",
      systemEventRequired: "Texto do evento de sistema obrigatório.",
      agentMessageRequired: "Mensagem do agente obrigatória.",
      nameRequired: "Nome da tarefa obrigatório.",
    },
    scheduler: "Agendador",
    schedulerSubtitle: "Status do agendador cron de propriedade do Gateway.",
    enabled: "Ativo",
    jobs: "Tarefas",
    nextWake: "Próximo despertar",
    newJob: "Nova Tarefa",
    newJobSubtitle: "Crie um despertar agendado ou execução de agente.",
    name: "Nome",
    description: "Descrição",
    agentId: "ID do Agente",
    schedule: "Agendamento",
    every: "A cada",
    at: "Em",
    session: "Sessão",
    wakeMode: "Modo de Despertar",
    payload: "Carga",
    systemText: "Texto do sistema",
    agentMessage: "Mensagem do agente",
    delivery: "Entrega",
    timeout: "Tempo limite (segundos)",
    channel: "Canal",
    to: "Para",
    addJob: "Adicionar tarefa",
    allJobs: "Tarefas",
    allJobsSubtitle: "Todas as tarefas agendadas armazenadas no gateway.",
    noJobs: "Nenhuma tarefa ainda.",
    runHistory: "Histórico de execução",
    runHistorySubtitle: "Últimas execuções para {{job}}.",
    selectJob: "(selecione uma tarefa)",
    selectJobHelp: "Selecione uma tarefa para inspecionar o histórico de execução.",
    noRuns: "Nenhuma execução ainda.",
    runAt: "Executar em",
    unit: "Unidade",
    expression: "Expressão",
    timezone: "Fuso horário (opcional)",
    agent: "Agente: {{id}}",
    run: "Executar",
    runs: "Execuções",
    remove: "Remover",
    nextHeartbeat: "Próximo heartbeat",
    now: "Agora",
    systemEvent: "Evento do sistema",
    agentTurn: "Turno do agente",
    announce: "Anunciar resumo (padrão)",
    announceShort: "Anunciar",
    dm: "Mensagem direta",
    none: "Nenhum (interno)",
    minutes: "Minutos",
    hours: "Horas",
    days: "Dias",
    cronExpression: "Cron",
    main: "Principal",
    isolated: "Isolado",
    defaultPlaceholder: "Padrão",
    deliveryToPlaceholder: "+1555… ou id do chat",
    systemLabel: "Sistema",
    promptLabel: "Prompt",
    deliveryLabel: "Entrega",
    statusLabel: "Status",
    nextLabel: "Próximo",
    lastUsed: "Último usado",
    lastLabel: "Último",
    openRunChat: "Abrir chat da execução",
    na: "N/D",
  },
  presence: {
    noInstances: "Nenhuma instância ainda.",
    noPayload: "Nenhum payload de presença.",
  },

  // Visão de Nodes
  nodes: {
    scopeNames: {
      operator: "Operador",
      operator_admin: "Administrador",
      operator_approvals: "Aprovações",
      operator_pairing: "Pareamento",
    },
    nodesTitle: "Nós (Nodes)",
    nodes: "Nós (Nodes)",
    nodesSubtitle: "Dispositivos pareados e capacidades.",
    noNodes: "Nenhum nó encontrado.",
    loadApprovalsHelp: "Carregue as aprovações para visualizar/editar as políticas.",
    unpaired: "Não pareados",
    devices: "Dispositivos",
    devicesSubtitle: "Gerencie pareamento e tokens.",
    pending: "Pendente",
    paired: "Pareado",
    noPaired: "Nenhum dispositivo pareado.",
    requested: "Solicitado",
    approve: "Aprovar",
    reject: "Rejeitar",
    noTokens: "Sem tokens.",
    tokens: "Tokens",
    revoked: "Revogado",
    active: "Ativo",
    scope: "Escopo",
    rotate: "Rotacionar",
    revoke: "Revogar",
    execNodeBinding: "Vínculo de Node de Execução",
    execNodeBindingSubtitle: "Configure nodes de execução padrão para agentes.",
    configHelp: "Ajuda da config...",
    loadConfigHelp: "Carregue a config para editar vínculos.",
    defaultBinding: "Vínculo Padrão",
    defaultBindingSubtitle: "Node de fallback para execução.",
    node: "Node",
    anyNode: "Qualquer Node",
    noNodesWithRun: "Nenhum node com capacidade de execução.",
    defaultAgent: "Agente Padrão",
    agent: "Agente",
    usesDefault: "Usa padrão ({{value}})",
    override: "substitui ({{value}})",
    useDefault: "Usar padrão",
    binding: "Vínculo",
    roles: "Funções",
    role: "Função",
    scopes: "Escopos",
    repair: "Reparo",

    // New keys
    execApprovalsTitle: "Aprovações de Execução",
    execApprovalsSubtitle:
      "Lista de permissão e política de aprovação para <span class='mono'>exec host=gateway/node</span>.",
    loadApprovals: "Carregar aprovações",
    targetTitle: "Alvo",
    targetSubtitle: "Gateway edita aprovações locais; node edita o node selecionado.",
    hostLabel: "Host",
    gatewayOption: "Gateway",
    nodeOption: "Node",
    nodeLabel: "Node",
    selectNode: "Selecione um node",
    noExecNodes: "Nenhum node anuncia aprovações de execução ainda.",
    defaultsButton: "Padrões",
    securityDeny: "Negar",
    securityAllowlist: "Lista de Permissão",
    securityFull: "Completo",
    askOff: "Desligado",
    askOnMiss: "Na Falta (On-miss)",
    askAlways: "Sempre",
    security: "Segurança",
    defaultSecurityMode: "Modo de segurança padrão",
    default: "Padrão ({{value}})",
    mode: "Modo",
    ask: "Perguntar",
    defaultPromptPolicy: "Política de prompt padrão",
    askFallback: "Fallback de Pergunta",
    askFallbackHelp: "Política de fallback quando a pergunta é descartada.",
    fallback: "Fallback",
    autoAllowSkillClis: "Auto-permitir Skill CLIs",
    autoAllowSkillClisHelp: "Permitir automaticamente comandos CLI de skills instaladas.",
    usingDefault: "Usando padrão ({{value}})",
    allowlist: "Lista de Permissão",
    caseInsensitiveGlobPatterns: "Padrões glob insensíveis a maiúsculas.",
    addPattern: "Adicionar Padrão",
    noAllowlistEntries: "Nenhuma entrada na lista de permissão.",
    newPattern: "Novo Padrão",
    lastUsed: "Último uso",
    pattern: "Padrão",
  },

  // Debug View
  debug: {
    snapshots: "Snapshots",
    snapshotsSubtitle: "Dados de status, health e heartbeat.",
    status: "Status",
    health: "Saúde (Health)",
    lastHeartbeat: "Última Batida (Heartbeat)",
    manualRpc: "RPC Manual",
    manualRpcSubtitle: "Envie um método bruto do gateway com parâmetros JSON.",
    method: "Método",
    params: "Parâmetros (JSON)",
    call: "Chamar",
    models: "Modelos",
    modelsSubtitle: "Catálogo de lista de modelos.",
    eventLog: "Log de Eventos",
    eventLogSubtitle: "Últimos eventos do gateway.",
    noEvents: "Nenhum evento ainda.",
    criticalIssues: "{{count}} críticos",
    warnings: "{{count}} avisos",
    noCriticalIssues: "Nenhum problema crítico",
    securityAudit: "Auditoria de segurança: {{label}}{{info}}. Execute",
    securityAuditSuffix: "para detalhes.",
    infoCount: " · {{count}} info",
  },

  // Config Form
  configForm: {
    unsupportedNode: "Node de esquema não suportado. Use o modo Texto.",
    unsupportedType: "Tipo não suportado: {{type}}. Use o modo Texto.",
    unsupportedArray: "Esquema de array não suportado. Use o modo Texto.",
    default: "Padrão: {{value}}",
    resetToDefault: "Redefinir para o padrão",
    select: "Selecionar...",
    items: "{{count}} item{{plural}}",
    add: "Adicionar",
    noItems: 'Sem itens ainda. Clique em "Adicionar" para criar um.',
    item: "#{{index}}",
    removeItem: "Remover item",
    customEntries: "Entradas personalizadas",
    addEntry: "Adicionar Entrada",
    noCustomEntries: "Sem entradas personalizadas.",
    key: "Chave",
    jsonValue: "Valor JSON",
    removeEntry: "Remover entrada",
  },

  // Agents View
  agents: {
    title: "Agentes",
    subtitle: "{{count}} configurados.",
    noAgents: "Nenhum agente encontrado.",
    noConfiguredModels: "Nenhum modelo configurado",
    default: "Padrão",
    selectAgent: "Selecione um agente",
    selectAgentHelp: "Escolha um agente para inspecionar seu workspace e ferramentas.",
    workspace: "Workspace",
    primaryModel: "Modelo Primário",
    fallbackCount: "+{{count}} fallback",
    identityName: "Nome da Identidade",
    identityEmoji: "Emoji da Identidade",
    skillsFilter: "Filtro de Skills",
    modelSelection: "Seleção de Modelo",
    primaryModelLabel: "Modelo primário{{suffix}}",
    defaultSuffix: " (Padrão)",
    fallbacks: "Fallbacks (separados por vírgula)",
    inheritDefault: "Usar Padrão",
    inheritDefaultWithModel: "Usar Padrão ({{model}})",
    loadConfig: "Carregar Configuração",
    reloadConfig: "Recarregar Config",

    agentContext: "Contexto do Agente",
    contextSubtitle: "Configuração de workspace, identidade e modelo.",
    channels: "Canais",
    channelsSubtitle: "Snapshot de status de canal em todo o gateway.",
    lastRefresh: "Última atualização: {{time}}",
    loadChannels: "Carregar canais para ver status ao vivo.",
    noChannels: "Nenhum canal encontrado.",
    scheduler: "Agendador",
    schedulerSubtitle: "Status do cron do gateway.",
    agentCronJobs: "Tarefas Cron do Agente",
    agentCronJobsSubtitle: "Tarefas agendadas visando este agente.",
    noJobsAssigned: "Nenhuma tarefa atribuída.",
    coreFiles: "Arquivos Principais",
    coreFilesSubtitle: "Persona de inicialização, identidade e orientação de ferramentas.",
    loadFiles: "Carregue os arquivos do workspace do agente para editar instruções principais.",
    noFiles: "Nenhum arquivo encontrado.",
    selectFile: "Selecione um arquivo para editar.",
    reset: "Redefinir",
    missingFile: "Este arquivo está faltando. Salvar irá criá-lo no workspace do agente.",
    content: "Conteúdo",
    missing: "Faltando",
    save: "Salvar",
    saved: "Salvo!",
    fileName: "Nome do Arquivo",
    newFile: "Novo Arquivo",
    delete: "Excluir",
    confirmDelete: "Confirmar Exclusão",
    createFile: "Criar Arquivo",
    inherit: "Usar Padrão",
    tools: "Ferramentas",
    toolsSubtitle: "Definições de ferramentas ativas e substituições de política.",
    loadTools: "Carregue a configuração para editar políticas de ferramentas.",
    profile: "Perfil",
    overrides: "Substituições",
    allow: "Permitir",
    deny: "Negar",
    policy: "Política",
    allowed: "Permitido",
    denied: "Negado",
    base: "Base",
    extra: "Extra",
    tabs: {
      overview: "Visão Geral",
      files: "Arquivos",
      tools: "Ferramentas",
      skills: "Skills",
      channels: "Canais",
      cron: "Tarefas Cron",
    },

    headerSubtitle: "Workspace do agente e roteamento.",
    overviewSubtitle: "Caminhos do workspace e metadados de identidade.",
    channelsConnected: "{{connected}}/{{total}} conectados",
    channelsConfigured: "{{count}} configurados",
    channelsEnabled: "{{count}} habilitados",
    noAccounts: "Sem contas",
    notConfigured: "Não configurado",
    disabled: "Desabilitado",
    cronSubtitle: "Workspace e alvos de agendamento.",
    toolAccess: "Acesso a Ferramentas",
    toolAccessSubtitle: "Perfil + substituições por ferramenta para este agente.",
    enabledCount: "Habilitados.",
    enableAll: "Habilitar Tudo",
    disableAll: "Desabilitar Tudo",
    source: "Fonte",
    unsaved: "Não salvo",
    quickPresets: "Predefinições Rápidas",
    globalDefault: "Padrão Global",
    skillAllowlistSubtitle: "Lista de permissão de skills por agente e skills do workspace.",
    useAll: "Usar Tudo",
    filter: "Filtrar",
    searchSkills: "Buscar skills",
    shown: "Exibidos",
    noSkills: "Nenhuma skill encontrada.",
    skillGroups: {
      workspace: "Skills do Workspace",
      builtIn: "Skills Embutidas",
      installed: "Skills Instaladas",
      extra: "Skills Extras",
      other: "Outras Skills",
    },
    skillStatus: {
      eligible: "Elegível",
      blocked: "Bloqueado",
      disabled: "Desabilitado",
      missing: "Faltando:",
      reason: "Motivo:",
      blockedByAllowlist: "Bloqueado pela lista de permissão",
    },
    loadConfigInfo: "Carregue a configuração do gateway para ajustar perfis de ferramentas.",
    explicitAllowInfo:
      "Este agente está usando uma lista de permissão explícita na configuração. Substituições são gerenciadas na aba Config.",
    globalAllowInfo:
      "Global tools.allow está definido. Substituições do agente não podem habilitar ferramentas bloqueadas globalmente.",
    loadSkillsInfo: "Carregue a configuração do gateway para definir skills por agente.",
    customAllowlistInfo: "Este agente usa uma lista de permissão de skills personalizada.",
    allSkillsInfo:
      "Todas as skills estão habilitadas. Desabilitar qualquer skill criará uma lista de permissão por agente.",
    loadSkillsWorkspaceInfo:
      "Carregue skills para este agente para ver entradas específicas do workspace.",
    toolSections: {
      fs: "Arquivos",
      runtime: "Runtime",
      web: "Web",
      memory: "Memória",
      sessions: "Sessões",
      ui: "UI",
      messaging: "Mensagens",
      automation: "Automação",
      nodes: "Nodes",
      agents: "Agentes",
      media: "Mídia",
    },
    toolDescriptions: {
      read: "Ler conteúdo de arquivos",
      write: "Criar ou sobrescrever arquivos",
      edit: "Realizar edições precisas",
      apply_patch: "Aplicar patches em arquivos (OpenAI)",
      exec: "Executar comandos shell",
      process: "Gerenciar processos em segundo plano",
      web_search: "Pesquisar na web",
      web_fetch: "Buscar conteúdo da web",
      memory_search: "Busca semântica",
      memory_get: "Ler arquivos de memória",
      sessions_list: "Listar sessões",
      sessions_history: "Histórico da sessão",
      sessions_send: "Enviar para sessão",
      sessions_spawn: "Abrir sub-agente",
      session_status: "Status da sessão",
      browser: "Controlar navegador web",
      canvas: "Controlar canvases",
      message: "Enviar mensagens",
      cron: "Agendar tarefas",
      gateway: "Controle do gateway",
      nodes: "Nodes + dispositivos",
      agents_list: "Listar agentes",
      image: "Compreensão de imagem",
    },
    toolLabels: {
      read: "Ler",
      write: "Escrever",
      edit: "Editar",
      apply_patch: "Aplicar patch",
      exec: "Executar",
      process: "Processos",
      web_search: "Pesquisa web",
      web_fetch: "Buscar web",
      memory_search: "Pesquisa memoria",
      memory_get: "Obter memoria",
      sessions_list: "Listar sessoes",
      sessions_history: "Historico sessoes",
      sessions_send: "Enviar sessao",
      sessions_spawn: "Abrir subagente",
      session_status: "Status sessao",
      browser: "Navegador",
      canvas: "Canvas",
      message: "Mensagem",
      cron: "Agendamento",
      gateway: "Gateway",
      nodes: "Nodes",
      agents_list: "Listar agentes",
      image: "Imagem",
    },
    allSkillsLabel: "Todas as skills",
    skillsSelected: "{{count}} selecionadas",
  },

  profiles: {
    minimal: "Mínimo",
    coding: "Codificação",
    messaging: "Mensagens",
    full: "Completo",
  },

  // Overview
  overview: {
    snapshot: "Status",
    uptime: "Tempo Ativo",
    notes: "Notas",
    accessTitle: "Acesso ao Gateway",
    accessSubtitle: "Onde o dashboard se conecta e como autentica.",
    wsUrl: "URL do WebSocket",
    gatewayToken: "Token",
    password: "Senha (não armazenada)",
    passwordPlaceholder: "Senha do sistema ou compartilhada",
    defaultSessionKey: "Chave de Sessão Padrão",
    connectHint: "Clique em Conectar para aplicar alterações.",
    tickInterval: "Intervalo de Ciclo",
    lastChannelsRefresh: "Última Atualização de Canais",
    channelsHint: "Use Canais para vincular WhatsApp, Telegram, Discord, Signal ou iMessage.",
    presenceSubtitle: "Sinais de presença nos últimos 5 minutos.",
    sessionsSubtitle: "Chaves de sessão recentes rastreadas pelo gateway.",
    cronNextWake: "Próximo despertar",
    tailscaleTitle: "Tailscale serve",
    tailscaleNote: "Prefira modo serve para manter o gateway em loopback com autenticação tailnet.",
    sessionHygieneTitle: "Higiene de Sessão",
    sessionHygieneNote: "Use /new ou edição de sessão para lidar com o contexto.",
    cronRemindersTitle: "Lembretes do Cron",
    cronRemindersNote: "Use sessões isoladas para execuções recorrentes.",
    snapshotSubtitle: "Informações mais recentes de handshake do gateway.",
    notesSubtitle: "Lembretes rápidos para configurações de controle remoto.",
    authHintRequired:
      "Este gateway requer autenticação. Adicione um token ou senha e clique em Conectar.",
    authHintDoctorSetToken: "openclaw doctor --generate-gateway-token → definir token",
    authHintDashboardNoOpen: "openclaw dashboard --no-open → abrir a interface de Controle",
    authDocsLink: "Docs: Autenticação da Interface de Controle",
    authDocsTitle: "Documentação de autenticação (abre em nova aba)",
    authFailedHint:
      "Falha na autenticação. Atualize o token ou senha nas configurações e clique em Conectar.",
    insecureContextHint:
      "Esta página está via HTTP, então o navegador bloqueia a identidade do dispositivo. Use HTTPS (Tailscale Serve) ou abra",
    insecureContextLocalhost: "no host do gateway.",
    insecureContextAllowInsecure: "Se você precisar permanecer em HTTP, defina",
    insecureContextConfigEntry: "gateway.controlUi.allowInsecureAuth: true",
    insecureContextTokenOnly: "(apenas token).",
    tailscaleDocsLink: "Docs: Tailscale Serve",
    tailscaleDocsTitle: "Documentação do Tailscale Serve (abre em nova aba)",
    insecureHttpDocsLink: "Docs: HTTP inseguro",
    insecureHttpDocsTitle: "Documentação de HTTP inseguro (abre em nova aba)",
  },

  // Visão de Instâncias
  instances: {
    title: "Instâncias Conectadas",
    subtitle: "Beacons de presença do gateway e clientes.",
    noInstances: "Nenhuma instância reportada ainda.",
    unknown: "Desconhecido",
    scopesCount: "{{count}} escopos",
    scopesList: "Escopos: {{list}}",
    lastInput: "Última entrada {{time}}",
    reason: "Motivo {{reason}}",
    na: "N/D",
    unknownHost: "Host desconhecido",
  },
};
