/**
 * Node-RED Flow Builder Utilities
 * Provides helper functions for creating and manipulating Node-RED flows programmatically.
 */

import { randomUUID } from "node:crypto";

// ============================================================================
// Types
// ============================================================================

export type NodePosition = {
  x: number;
  y: number;
};

export type NodeJson = {
  id: string;
  type: string;
  name?: string;
  x: number;
  y: number;
  z: string;
  wires: string[][];
  [key: string]: unknown;
};

export type FlowTabJson = {
  id: string;
  type: "tab";
  label: string;
  disabled?: boolean;
  info?: string;
};

export type CreateNodeParams = {
  type: string;
  name?: string;
  flowId: string;
  position?: NodePosition;
  properties?: Record<string, unknown>;
  wires?: string[][];
};

export type WireConnection = {
  sourceId: string;
  targetId: string;
  sourcePort: number;
};

export type ValidationResult = {
  valid: boolean;
  errors: string[];
  warnings: string[];
  stats: {
    tabCount: number;
    nodeCount: number;
    wireCount: number;
  };
};

// ============================================================================
// ID Generation
// ============================================================================

export function generateNodeId(): string {
  const uuid = randomUUID().replace(/-/g, "");
  return `${uuid.slice(0, 8)}.${uuid.slice(8, 14)}`;
}

export function generateFlowId(): string {
  return generateNodeId();
}

// ============================================================================
// Node Creation
// ============================================================================

const DEFAULT_NODE_SPACING = 200;
const DEFAULT_START_X = 100;
const DEFAULT_START_Y = 100;

export function createNode(params: CreateNodeParams): NodeJson {
  const { type, name, flowId, position, properties = {}, wires = [[]] } = params;
  return {
    id: generateNodeId(),
    type,
    name: name || "",
    x: position?.x ?? DEFAULT_START_X,
    y: position?.y ?? DEFAULT_START_Y,
    z: flowId,
    wires,
    ...properties,
  };
}

export function createFlowTab(label: string, info?: string): FlowTabJson {
  return {
    id: generateFlowId(),
    type: "tab",
    label,
    disabled: false,
    info,
  };
}

// ============================================================================
// NodeFactory - Core Nodes
// ============================================================================

export const NodeFactory = {
  // --------------------------------------------------------------------------
  // Common Nodes
  // --------------------------------------------------------------------------
  inject(flowId: string, position?: NodePosition, options: {
    name?: string;
    payload?: string;
    payloadType?: "date" | "str" | "num" | "bool" | "json" | "flow" | "global" | "env";
    topic?: string;
    repeat?: string;
    crontab?: string;
    once?: boolean;
    onceDelay?: number;
  } = {}): NodeJson {
    return createNode({
      type: "inject",
      name: options.name,
      flowId,
      position,
      properties: {
        payload: options.payload ?? "",
        payloadType: options.payloadType ?? "date",
        topic: options.topic ?? "",
        repeat: options.repeat ?? "",
        crontab: options.crontab ?? "",
        once: options.once ?? false,
        onceDelay: options.onceDelay ?? 0.1,
      },
    });
  },

  debug(flowId: string, position?: NodePosition, options: {
    name?: string;
    active?: boolean;
    tosidebar?: boolean;
    console?: boolean;
    tostatus?: boolean;
    complete?: "payload" | "true" | "false" | string;
  } = {}): NodeJson {
    return createNode({
      type: "debug",
      name: options.name,
      flowId,
      position,
      wires: [],
      properties: {
        active: options.active ?? true,
        tosidebar: options.tosidebar ?? true,
        console: options.console ?? false,
        tostatus: options.tostatus ?? false,
        complete: options.complete ?? "payload",
        targetType: "msg",
        statusVal: "",
        statusType: "auto",
      },
    });
  },

  complete(flowId: string, position?: NodePosition, options: {
    name?: string;
    scope?: string[];
  } = {}): NodeJson {
    return createNode({
      type: "complete",
      name: options.name,
      flowId,
      position,
      properties: {
        scope: options.scope ?? [],
        uncaught: false,
      },
    });
  },

  catch(flowId: string, position?: NodePosition, options: {
    name?: string;
    scope?: "all" | string[];
    uncaught?: boolean;
  } = {}): NodeJson {
    return createNode({
      type: "catch",
      name: options.name,
      flowId,
      position,
      properties: {
        scope: options.scope === "all" ? null : (options.scope ?? null),
        uncaught: options.uncaught ?? false,
      },
    });
  },

  status(flowId: string, position?: NodePosition, options: {
    name?: string;
    scope?: "all" | string[];
  } = {}): NodeJson {
    return createNode({
      type: "status",
      name: options.name,
      flowId,
      position,
      properties: {
        scope: options.scope === "all" ? null : (options.scope ?? null),
      },
    });
  },

  link_in(flowId: string, position?: NodePosition, options: {
    name?: string;
    links?: string[];
  } = {}): NodeJson {
    return createNode({
      type: "link in",
      name: options.name,
      flowId,
      position,
      properties: { links: options.links ?? [] },
    });
  },

  link_out(flowId: string, position?: NodePosition, options: {
    name?: string;
    mode?: "link" | "return";
    links?: string[];
  } = {}): NodeJson {
    return createNode({
      type: "link out",
      name: options.name,
      flowId,
      position,
      wires: [],
      properties: {
        mode: options.mode ?? "link",
        links: options.links ?? [],
      },
    });
  },

  link_call(flowId: string, position?: NodePosition, options: {
    name?: string;
    links?: string[];
    timeout?: number;
  } = {}): NodeJson {
    return createNode({
      type: "link call",
      name: options.name,
      flowId,
      position,
      properties: {
        links: options.links ?? [],
        timeout: options.timeout ?? 30,
      },
    });
  },

  comment(flowId: string, position?: NodePosition, options: {
    name?: string;
    info?: string;
  } = {}): NodeJson {
    return createNode({
      type: "comment",
      name: options.name ?? "Comment",
      flowId,
      position,
      wires: [],
      properties: { info: options.info ?? "" },
    });
  },

  junction(flowId: string, position?: NodePosition): NodeJson {
    return createNode({
      type: "junction",
      flowId,
      position,
    });
  },

  // --------------------------------------------------------------------------
  // Function Nodes
  // --------------------------------------------------------------------------
  function(flowId: string, position?: NodePosition, options: {
    name?: string;
    func?: string;
    outputs?: number;
    initialize?: string;
    finalize?: string;
    libs?: Array<{ var: string; module: string }>;
  } = {}): NodeJson {
    const outputs = options.outputs ?? 1;
    return createNode({
      type: "function",
      name: options.name,
      flowId,
      position,
      wires: Array(outputs).fill([]),
      properties: {
        func: options.func ?? "return msg;",
        outputs,
        timeout: 0,
        noerr: 0,
        initialize: options.initialize ?? "",
        finalize: options.finalize ?? "",
        libs: options.libs ?? [],
      },
    });
  },

  change(flowId: string, position?: NodePosition, options: {
    name?: string;
    rules?: Array<{
      t: "set" | "change" | "delete" | "move";
      p: string;
      pt?: "msg" | "flow" | "global";
      to?: string;
      tot?: "str" | "num" | "bool" | "json" | "date" | "msg" | "flow" | "global" | "env";
      from?: string;
      fromt?: string;
      re?: boolean;
    }>;
  } = {}): NodeJson {
    return createNode({
      type: "change",
      name: options.name,
      flowId,
      position,
      properties: {
        rules: options.rules ?? [{ t: "set", p: "payload", pt: "msg", to: "", tot: "str" }],
        action: "",
        property: "",
        from: "",
        to: "",
        reg: false,
      },
    });
  },

  switch(flowId: string, position?: NodePosition, options: {
    name?: string;
    property?: string;
    propertyType?: "msg" | "flow" | "global" | "env" | "jsonata";
    rules?: Array<{
      t: "eq" | "neq" | "lt" | "lte" | "gt" | "gte" | "btwn" | "cont" | "regex" | "true" | "false" | "null" | "nnull" | "empty" | "nempty" | "istype" | "else";
      v?: string;
      vt?: "str" | "num" | "msg" | "flow" | "global" | "env" | "jsonata";
      v2?: string;
      v2t?: string;
    }>;
    checkall?: boolean;
    repair?: boolean;
  } = {}): NodeJson {
    const rules = options.rules ?? [{ t: "else" }];
    return createNode({
      type: "switch",
      name: options.name,
      flowId,
      position,
      wires: Array(rules.length).fill([]),
      properties: {
        property: options.property ?? "payload",
        propertyType: options.propertyType ?? "msg",
        rules,
        checkall: options.checkall !== false ? "true" : "false",
        repair: options.repair ?? false,
        outputs: rules.length,
      },
    });
  },

  range(flowId: string, position?: NodePosition, options: {
    name?: string;
    minin?: string;
    maxin?: string;
    minout?: string;
    maxout?: string;
    action?: "scale" | "clamp" | "roll";
    round?: boolean;
  } = {}): NodeJson {
    return createNode({
      type: "range",
      name: options.name,
      flowId,
      position,
      properties: {
        minin: options.minin ?? "0",
        maxin: options.maxin ?? "100",
        minout: options.minout ?? "0",
        maxout: options.maxout ?? "1",
        action: options.action ?? "scale",
        round: options.round ?? false,
        property: "payload",
      },
    });
  },

  template(flowId: string, position?: NodePosition, options: {
    name?: string;
    template?: string;
    format?: "handlebars" | "plain" | "json";
    syntax?: "mustache" | "plain";
    field?: string;
    output?: "str" | "json";
  } = {}): NodeJson {
    return createNode({
      type: "template",
      name: options.name,
      flowId,
      position,
      properties: {
        field: options.field ?? "payload",
        fieldType: "msg",
        format: options.format ?? "handlebars",
        syntax: options.syntax ?? "mustache",
        template: options.template ?? "{{payload}}",
        output: options.output ?? "str",
      },
    });
  },

  delay(flowId: string, position?: NodePosition, options: {
    name?: string;
    pauseType?: "delay" | "delayv" | "rate" | "timed" | "queue" | "random";
    timeout?: string;
    timeoutUnits?: "milliseconds" | "seconds" | "minutes" | "hours";
    rate?: string;
    rateUnits?: "second" | "minute" | "hour";
    drop?: boolean;
  } = {}): NodeJson {
    return createNode({
      type: "delay",
      name: options.name,
      flowId,
      position,
      properties: {
        pauseType: options.pauseType ?? "delay",
        timeout: options.timeout ?? "5",
        timeoutUnits: options.timeoutUnits ?? "seconds",
        rate: options.rate ?? "1",
        nbRateUnits: "1",
        rateUnits: options.rateUnits ?? "second",
        randomFirst: "1",
        randomLast: "5",
        randomUnits: "seconds",
        drop: options.drop ?? false,
        allowrate: false,
        outputs: 1,
      },
    });
  },

  trigger(flowId: string, position?: NodePosition, options: {
    name?: string;
    op1?: string;
    op1type?: "str" | "num" | "date" | "flow" | "global" | "msg" | "pay" | "nul";
    op2?: string;
    op2type?: "str" | "num" | "date" | "flow" | "global" | "nul";
    duration?: string;
    units?: "ms" | "s" | "min" | "hr";
    extend?: boolean;
    reset?: string;
  } = {}): NodeJson {
    return createNode({
      type: "trigger",
      name: options.name,
      flowId,
      position,
      properties: {
        op1: options.op1 ?? "1",
        op2: options.op2 ?? "0",
        op1type: options.op1type ?? "str",
        op2type: options.op2type ?? "str",
        duration: options.duration ?? "250",
        extend: options.extend ?? true,
        overrideDelay: false,
        units: options.units ?? "ms",
        reset: options.reset ?? "",
        bytopic: "all",
        topic: "topic",
        outputs: 1,
      },
    });
  },

  exec(flowId: string, position?: NodePosition, options: {
    name?: string;
    command?: string;
    addpay?: "payload" | "none";
    append?: string;
    useSpawn?: boolean;
    timer?: string;
    winHide?: boolean;
    oldrc?: boolean;
  } = {}): NodeJson {
    return createNode({
      type: "exec",
      name: options.name,
      flowId,
      position,
      wires: [[], [], []], // stdout, stderr, return code
      properties: {
        command: options.command ?? "",
        addpay: options.addpay ?? "payload",
        append: options.append ?? "",
        useSpawn: options.useSpawn ? "true" : "false",
        timer: options.timer ?? "",
        winHide: options.winHide ?? false,
        oldrc: options.oldrc ?? false,
      },
    });
  },

  rbe(flowId: string, position?: NodePosition, options: {
    name?: string;
    func?: "rbe" | "deadband" | "deadbandEq" | "narrowband" | "narrowbandEq";
    gap?: string;
    start?: string;
    property?: string;
  } = {}): NodeJson {
    return createNode({
      type: "rbe",
      name: options.name,
      flowId,
      position,
      properties: {
        func: options.func ?? "rbe",
        gap: options.gap ?? "",
        start: options.start ?? "",
        inout: "out",
        septopics: true,
        property: options.property ?? "payload",
        topi: "topic",
      },
    });
  },

  // --------------------------------------------------------------------------
  // Network Nodes
  // --------------------------------------------------------------------------
  httpIn(flowId: string, position?: NodePosition, options: {
    name?: string;
    url: string;
    method: "get" | "post" | "put" | "delete" | "patch" | "options";
    upload?: boolean;
  }): NodeJson {
    return createNode({
      type: "http in",
      name: options.name,
      flowId,
      position,
      properties: {
        url: options.url,
        method: options.method,
        upload: options.upload ?? false,
        swaggerDoc: "",
      },
    });
  },

  httpResponse(flowId: string, position?: NodePosition, options: {
    name?: string;
    statusCode?: string;
    headers?: Record<string, string>;
  } = {}): NodeJson {
    return createNode({
      type: "http response",
      name: options.name,
      flowId,
      position,
      wires: [],
      properties: {
        statusCode: options.statusCode ?? "",
        headers: options.headers ?? {},
      },
    });
  },

  httpRequest(flowId: string, position?: NodePosition, options: {
    name?: string;
    method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "HEAD" | "use";
    url?: string;
    ret?: "txt" | "obj" | "bin";
    paytoqs?: "ignore" | "body" | "query";
    authType?: "" | "basic" | "digest" | "bearer";
    persist?: boolean;
  } = {}): NodeJson {
    return createNode({
      type: "http request",
      name: options.name,
      flowId,
      position,
      properties: {
        method: options.method ?? "GET",
        ret: options.ret ?? "obj",
        paytoqs: options.paytoqs ?? "ignore",
        url: options.url ?? "",
        tls: "",
        persist: options.persist ?? false,
        proxy: "",
        insecureHTTPParser: false,
        authType: options.authType ?? "",
        senderr: false,
        headers: [],
      },
    });
  },

  websocketIn(flowId: string, position?: NodePosition, options: {
    name?: string;
    server?: string;
    client?: string;
  } = {}): NodeJson {
    return createNode({
      type: "websocket in",
      name: options.name,
      flowId,
      position,
      properties: {
        server: options.server ?? "",
        client: options.client ?? "",
      },
    });
  },

  websocketOut(flowId: string, position?: NodePosition, options: {
    name?: string;
    server?: string;
    client?: string;
  } = {}): NodeJson {
    return createNode({
      type: "websocket out",
      name: options.name,
      flowId,
      position,
      wires: [],
      properties: {
        server: options.server ?? "",
        client: options.client ?? "",
      },
    });
  },

  tcpIn(flowId: string, position?: NodePosition, options: {
    name?: string;
    server?: "server" | "client";
    host?: string;
    port?: string;
    datamode?: "stream" | "single";
    datatype?: "buffer" | "utf8" | "base64";
  } = {}): NodeJson {
    return createNode({
      type: "tcp in",
      name: options.name,
      flowId,
      position,
      properties: {
        server: options.server ?? "server",
        host: options.host ?? "",
        port: options.port ?? "",
        datamode: options.datamode ?? "stream",
        datatype: options.datatype ?? "buffer",
        newline: "",
        topic: "",
        trim: false,
        base64: false,
        tls: "",
      },
    });
  },

  tcpOut(flowId: string, position?: NodePosition, options: {
    name?: string;
    host?: string;
    port?: string;
    beserver?: "server" | "client" | "reply";
  } = {}): NodeJson {
    return createNode({
      type: "tcp out",
      name: options.name,
      flowId,
      position,
      wires: [],
      properties: {
        host: options.host ?? "",
        port: options.port ?? "",
        beserver: options.beserver ?? "client",
        base64: false,
        end: false,
        tls: "",
      },
    });
  },

  tcpRequest(flowId: string, position?: NodePosition, options: {
    name?: string;
    server?: string;
    port?: string;
    ret?: "buffer" | "string";
  } = {}): NodeJson {
    return createNode({
      type: "tcp request",
      name: options.name,
      flowId,
      position,
      properties: {
        server: options.server ?? "",
        port: options.port ?? "",
        out: "time",
        ret: options.ret ?? "buffer",
        splitc: "0",
        newline: "",
        trim: false,
        tls: "",
      },
    });
  },

  udpIn(flowId: string, position?: NodePosition, options: {
    name?: string;
    port?: string;
    multicast?: "false" | "multi";
    group?: string;
    datatype?: "buffer" | "utf8";
  } = {}): NodeJson {
    return createNode({
      type: "udp in",
      name: options.name,
      flowId,
      position,
      properties: {
        group: options.group ?? "",
        port: options.port ?? "",
        datatype: options.datatype ?? "buffer",
        iface: "",
        multicast: options.multicast ?? "false",
        ipv: "udp4",
      },
    });
  },

  udpOut(flowId: string, position?: NodePosition, options: {
    name?: string;
    addr?: string;
    port?: string;
    multicast?: "false" | "multi" | "broad";
  } = {}): NodeJson {
    return createNode({
      type: "udp out",
      name: options.name,
      flowId,
      position,
      wires: [],
      properties: {
        addr: options.addr ?? "",
        port: options.port ?? "",
        iface: "",
        multicast: options.multicast ?? "false",
        ipv: "udp4",
        outport: "",
        base64: false,
      },
    });
  },

  mqttIn(flowId: string, position?: NodePosition, options: {
    name?: string;
    topic: string;
    qos?: "0" | "1" | "2";
    broker?: string;
    datatype?: "auto" | "json" | "utf8" | "buffer";
  }): NodeJson {
    return createNode({
      type: "mqtt in",
      name: options.name,
      flowId,
      position,
      properties: {
        topic: options.topic,
        qos: options.qos ?? "2",
        datatype: options.datatype ?? "auto",
        broker: options.broker ?? "",
        nl: false,
        rap: true,
        rh: 0,
        inputs: 0,
      },
    });
  },

  mqttOut(flowId: string, position?: NodePosition, options: {
    name?: string;
    topic?: string;
    qos?: "0" | "1" | "2";
    retain?: boolean;
    broker?: string;
  } = {}): NodeJson {
    return createNode({
      type: "mqtt out",
      name: options.name,
      flowId,
      position,
      wires: [],
      properties: {
        topic: options.topic ?? "",
        qos: options.qos ?? "",
        retain: options.retain ? "true" : "",
        respTopic: "",
        contentType: "",
        userProps: "",
        correl: "",
        expiry: "",
        broker: options.broker ?? "",
      },
    });
  },

  // --------------------------------------------------------------------------
  // Sequence Nodes
  // --------------------------------------------------------------------------
  split(flowId: string, position?: NodePosition, options: {
    name?: string;
    splt?: string;
    spltType?: "str" | "bin" | "len";
    arraySplt?: number;
    stream?: boolean;
  } = {}): NodeJson {
    return createNode({
      type: "split",
      name: options.name,
      flowId,
      position,
      properties: {
        splt: options.splt ?? "\\n",
        spltType: options.spltType ?? "str",
        arraySplt: options.arraySplt ?? 1,
        arraySpltType: "len",
        stream: options.stream ?? false,
        addname: "",
      },
    });
  },

  join(flowId: string, position?: NodePosition, options: {
    name?: string;
    mode?: "auto" | "custom";
    build?: "array" | "object" | "string" | "buffer" | "merged";
    count?: string;
    timeout?: string;
    joiner?: string;
  } = {}): NodeJson {
    return createNode({
      type: "join",
      name: options.name,
      flowId,
      position,
      properties: {
        mode: options.mode ?? "auto",
        build: options.build ?? "array",
        property: "payload",
        propertyType: "msg",
        count: options.count ?? "",
        timeout: options.timeout ?? "",
        joiner: options.joiner ?? "\\n",
        joinerType: "str",
        accumulate: "false",
        reduceRight: false,
        reduceExp: "",
        reduceInit: "",
        reduceInitType: "",
        reduceFixup: "",
      },
    });
  },

  sort(flowId: string, position?: NodePosition, options: {
    name?: string;
    target?: string;
    targetType?: "msg" | "seq";
    order?: "ascending" | "descending";
    asNumber?: boolean;
  } = {}): NodeJson {
    return createNode({
      type: "sort",
      name: options.name,
      flowId,
      position,
      properties: {
        target: options.target ?? "payload",
        targetType: options.targetType ?? "msg",
        msgKey: "payload",
        msgKeyType: "elem",
        seqKey: "payload",
        seqKeyType: "msg",
        order: options.order ?? "ascending",
        as_num: options.asNumber ?? false,
      },
    });
  },

  batch(flowId: string, position?: NodePosition, options: {
    name?: string;
    mode?: "count" | "interval" | "concat";
    count?: number;
    overlap?: number;
    interval?: number;
    allowEmptySequence?: boolean;
  } = {}): NodeJson {
    return createNode({
      type: "batch",
      name: options.name,
      flowId,
      position,
      properties: {
        mode: options.mode ?? "count",
        count: options.count ?? 10,
        overlap: options.overlap ?? 0,
        interval: options.interval ?? 10,
        allowEmptySequence: options.allowEmptySequence ?? false,
        topics: [],
      },
    });
  },

  // --------------------------------------------------------------------------
  // Parser Nodes
  // --------------------------------------------------------------------------
  json(flowId: string, position?: NodePosition, options: {
    name?: string;
    action?: "" | "str" | "obj";
    property?: string;
  } = {}): NodeJson {
    return createNode({
      type: "json",
      name: options.name,
      flowId,
      position,
      properties: {
        action: options.action ?? "",
        property: options.property ?? "payload",
        pretty: false,
      },
    });
  },

  csv(flowId: string, position?: NodePosition, options: {
    name?: string;
    sep?: string;
    hdrin?: boolean;
    hdrout?: "none" | "all" | "once";
    ret?: "\\n" | "\\r\\n" | ",";
  } = {}): NodeJson {
    return createNode({
      type: "csv",
      name: options.name,
      flowId,
      position,
      properties: {
        sep: options.sep ?? ",",
        hdrin: options.hdrin ?? true,
        hdrout: options.hdrout ?? "none",
        multi: "mult",
        ret: options.ret ?? "\\n",
        temp: "",
        skip: "0",
        strings: true,
        include_empty_strings: "",
        include_null_values: "",
      },
    });
  },

  html(flowId: string, position?: NodePosition, options: {
    name?: string;
    tag?: string;
    ret?: "html" | "text" | "attr";
    as?: "single" | "multi";
  } = {}): NodeJson {
    return createNode({
      type: "html",
      name: options.name,
      flowId,
      position,
      properties: {
        tag: options.tag ?? "",
        ret: options.ret ?? "html",
        as: options.as ?? "multi",
      },
    });
  },

  xml(flowId: string, position?: NodePosition, options: {
    name?: string;
    property?: string;
    attr?: string;
    chr?: string;
  } = {}): NodeJson {
    return createNode({
      type: "xml",
      name: options.name,
      flowId,
      position,
      properties: {
        property: options.property ?? "payload",
        attr: options.attr ?? "$",
        chr: options.chr ?? "_",
      },
    });
  },

  yaml(flowId: string, position?: NodePosition, options: {
    name?: string;
    property?: string;
  } = {}): NodeJson {
    return createNode({
      type: "yaml",
      name: options.name,
      flowId,
      position,
      properties: {
        property: options.property ?? "payload",
      },
    });
  },

  // --------------------------------------------------------------------------
  // Storage Nodes
  // --------------------------------------------------------------------------
  file(flowId: string, position?: NodePosition, options: {
    name?: string;
    filename?: string;
    filenameType?: "str" | "msg" | "flow" | "global" | "env";
    appendNewline?: boolean;
    createDir?: boolean;
    overwriteFile?: "true" | "false" | "delete";
    encoding?: "none" | "utf8" | "binary" | "base64";
  } = {}): NodeJson {
    return createNode({
      type: "file",
      name: options.name,
      flowId,
      position,
      properties: {
        filename: options.filename ?? "",
        filenameType: options.filenameType ?? "str",
        appendNewline: options.appendNewline ?? true,
        createDir: options.createDir ?? false,
        overwriteFile: options.overwriteFile ?? "false",
        encoding: options.encoding ?? "none",
      },
    });
  },

  fileIn(flowId: string, position?: NodePosition, options: {
    name?: string;
    filename?: string;
    filenameType?: "str" | "msg" | "flow" | "global" | "env";
    format?: "utf8" | "lines" | "stream" | "";
    encoding?: "utf8" | "binary" | "base64";
    allProps?: boolean;
  } = {}): NodeJson {
    return createNode({
      type: "file in",
      name: options.name,
      flowId,
      position,
      properties: {
        filename: options.filename ?? "",
        filenameType: options.filenameType ?? "str",
        format: options.format ?? "utf8",
        chunk: false,
        sendError: false,
        encoding: options.encoding ?? "utf8",
        allProps: options.allProps ?? false,
      },
    });
  },

  watch(flowId: string, position?: NodePosition, options: {
    name?: string;
    files?: string;
    recursive?: boolean;
  } = {}): NodeJson {
    return createNode({
      type: "watch",
      name: options.name,
      flowId,
      position,
      properties: {
        files: options.files ?? "",
        recursive: options.recursive ?? true,
      },
    });
  },
};

// ============================================================================
// Flow Pattern Builders
// ============================================================================

export type FlowPattern = {
  tab: FlowTabJson;
  nodes: NodeJson[];
};

/**
 * Create a simple linear flow: inject → process → debug
 */
export function buildSimpleFlow(
  label: string,
  processingFunc?: string,
  options: { repeat?: string; payloadType?: string } = {},
): FlowPattern {
  const tab = createFlowTab(label);
  const inject = NodeFactory.inject(tab.id, { x: 100, y: 100 }, {
    name: "Start",
    repeat: options.repeat,
    payloadType: (options.payloadType as "date") ?? "date",
  });
  const func = NodeFactory.function(tab.id, { x: 300, y: 100 }, {
    name: "Process",
    func: processingFunc ?? "return msg;",
  });
  const debug = NodeFactory.debug(tab.id, { x: 500, y: 100 }, {
    name: "Output",
  });

  const nodes = chainNodes([inject, func, debug]);
  return { tab, nodes };
}

/**
 * Create an HTTP API endpoint flow
 */
export function buildHttpApiFlow(
  label: string,
  url: string,
  method: "get" | "post" | "put" | "delete" = "get",
  handlerFunc?: string,
): FlowPattern {
  const tab = createFlowTab(label);
  const httpIn = NodeFactory.httpIn(tab.id, { x: 100, y: 100 }, {
    name: `${method.toUpperCase()} ${url}`,
    url,
    method,
  });
  const func = NodeFactory.function(tab.id, { x: 300, y: 100 }, {
    name: "Handler",
    func: handlerFunc ?? `msg.payload = { success: true };\nreturn msg;`,
  });
  const httpRes = NodeFactory.httpResponse(tab.id, { x: 500, y: 100 });

  const nodes = chainNodes([httpIn, func, httpRes]);
  return { tab, nodes };
}

/**
 * Create a conditional routing flow with switch
 */
export function buildSwitchFlow(
  label: string,
  property: string,
  conditions: Array<{ value: string; handler?: string }>,
): FlowPattern {
  const tab = createFlowTab(label);
  const inject = NodeFactory.inject(tab.id, { x: 100, y: 200 }, {
    name: "Input",
  });

  const rules = conditions.map((c) => ({
    t: "eq" as const,
    v: c.value,
    vt: "str" as const,
  }));
  rules.push({ t: "else" as const, v: "", vt: "str" });

  const switchNode = NodeFactory.switch(tab.id, { x: 300, y: 200 }, {
    name: "Route",
    property,
    rules,
  });

  const outputs: NodeJson[] = [];
  for (let i = 0; i < conditions.length + 1; i++) {
    const y = 100 + i * 80;
    const debug = NodeFactory.debug(tab.id, { x: 500, y }, {
      name: i < conditions.length ? conditions[i].value : "else",
    });
    outputs.push(debug);
  }

  // Wire switch to outputs
  const wiredSwitch = {
    ...switchNode,
    wires: outputs.map((o) => [o.id]),
  };

  const wiredInject = connectNodes(inject, wiredSwitch.id);

  return {
    tab,
    nodes: [wiredInject, wiredSwitch, ...outputs],
  };
}

/**
 * Create error handling flow
 */
export function buildErrorHandlerFlow(
  label: string,
  handlerFunc?: string,
): FlowPattern {
  const tab = createFlowTab(label);
  const catchNode = NodeFactory.catch(tab.id, { x: 100, y: 100 }, {
    name: "Catch All",
    scope: "all",
  });
  const func = NodeFactory.function(tab.id, { x: 300, y: 100 }, {
    name: "Handle Error",
    func: handlerFunc ?? `node.error(msg.error.message);
msg.payload = {
    error: msg.error.message,
    timestamp: new Date().toISOString()
};
return msg;`,
  });
  const debug = NodeFactory.debug(tab.id, { x: 500, y: 100 }, {
    name: "Error Log",
  });

  const nodes = chainNodes([catchNode, func, debug]);
  return { tab, nodes };
}

/**
 * Create a data transformation pipeline
 */
export function buildTransformPipeline(
  label: string,
  transforms: Array<{ name: string; func: string }>,
): FlowPattern {
  const tab = createFlowTab(label);
  const inject = NodeFactory.inject(tab.id, undefined, { name: "Input" });
  
  const funcNodes = transforms.map((t, i) =>
    NodeFactory.function(tab.id, undefined, { name: t.name, func: t.func })
  );
  
  const debug = NodeFactory.debug(tab.id, undefined, { name: "Output" });
  
  const allNodes = [inject, ...funcNodes, debug];
  const nodes = layoutNodes(chainNodes(allNodes));
  
  return { tab, nodes };
}

/**
 * Create a split-process-join flow for parallel processing
 */
export function buildParallelProcessFlow(
  label: string,
  processingFunc?: string,
): FlowPattern {
  const tab = createFlowTab(label);
  const inject = NodeFactory.inject(tab.id, { x: 100, y: 100 }, {
    name: "Array Input",
    payload: "[1,2,3,4,5]",
    payloadType: "json",
  });
  const split = NodeFactory.split(tab.id, { x: 250, y: 100 });
  const func = NodeFactory.function(tab.id, { x: 400, y: 100 }, {
    name: "Process Each",
    func: processingFunc ?? "msg.payload = msg.payload * 2;\nreturn msg;",
  });
  const join = NodeFactory.join(tab.id, { x: 550, y: 100 });
  const debug = NodeFactory.debug(tab.id, { x: 700, y: 100 });

  const nodes = chainNodes([inject, split, func, join, debug]);
  return { tab, nodes };
}

// ============================================================================
// Wire Connections
// ============================================================================

export function connectNodes(
  sourceNode: NodeJson,
  targetId: string,
  sourcePort: number = 0,
): NodeJson {
  const wires = [...sourceNode.wires];
  while (wires.length <= sourcePort) {
    wires.push([]);
  }
  if (!wires[sourcePort].includes(targetId)) {
    wires[sourcePort] = [...wires[sourcePort], targetId];
  }
  return { ...sourceNode, wires };
}

export function chainNodes(nodes: NodeJson[]): NodeJson[] {
  if (nodes.length < 2) return nodes;
  const result: NodeJson[] = [];
  for (let i = 0; i < nodes.length; i++) {
    let node = nodes[i];
    if (i < nodes.length - 1 && node.wires.length > 0) {
      node = connectNodes(node, nodes[i + 1].id, 0);
    }
    result.push(node);
  }
  return result;
}

export function layoutNodes(
  nodes: NodeJson[],
  options: {
    startX?: number;
    startY?: number;
    direction?: "horizontal" | "vertical";
    spacing?: number;
  } = {},
): NodeJson[] {
  const {
    startX = DEFAULT_START_X,
    startY = DEFAULT_START_Y,
    direction = "horizontal",
    spacing = DEFAULT_NODE_SPACING,
  } = options;

  return nodes.map((node, index) => ({
    ...node,
    x: direction === "horizontal" ? startX + index * spacing : startX,
    y: direction === "vertical" ? startY + index * spacing : startY,
  }));
}

// ============================================================================
// Flow Validation
// ============================================================================

export function validateFlow(flowItems: unknown[]): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  let tabCount = 0;
  let nodeCount = 0;
  let wireCount = 0;

  if (!Array.isArray(flowItems)) {
    return {
      valid: false,
      errors: ["Flow must be an array"],
      warnings: [],
      stats: { tabCount: 0, nodeCount: 0, wireCount: 0 },
    };
  }

  const nodeIds = new Set<string>();
  const flowIds = new Set<string>();

  for (const item of flowItems) {
    if (typeof item !== "object" || item === null) {
      errors.push("Invalid flow item: not an object");
      continue;
    }

    const node = item as Record<string, unknown>;

    if (typeof node.id !== "string" || !node.id) {
      errors.push("Node missing required 'id' field");
      continue;
    }

    if (nodeIds.has(node.id)) {
      errors.push(`Duplicate node ID: ${node.id}`);
    }
    nodeIds.add(node.id);

    if (typeof node.type !== "string" || !node.type) {
      errors.push(`Node ${node.id} missing required 'type' field`);
      continue;
    }

    if (node.type === "tab") {
      tabCount++;
      flowIds.add(node.id);
      if (typeof node.label !== "string") {
        warnings.push(`Tab ${node.id} missing 'label' field`);
      }
    } else if (node.type === "subflow") {
      flowIds.add(node.id);
    } else {
      nodeCount++;
      if (typeof node.x !== "number" || typeof node.y !== "number") {
        warnings.push(`Node ${node.id} (${node.type}) missing position (x, y)`);
      }
      if (typeof node.z !== "string") {
        warnings.push(`Node ${node.id} (${node.type}) missing flow reference (z)`);
      }
      if (node.wires !== undefined && Array.isArray(node.wires)) {
        for (const port of node.wires as unknown[][]) {
          if (Array.isArray(port)) {
            wireCount += port.length;
          }
        }
      }
    }
  }

  for (const item of flowItems) {
    const node = item as Record<string, unknown>;
    if (node.type !== "tab" && node.type !== "subflow" && typeof node.z === "string") {
      if (!flowIds.has(node.z) && !node.z.startsWith("subflow:")) {
        warnings.push(`Node ${node.id} references non-existent flow: ${node.z}`);
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings, stats: { tabCount, nodeCount, wireCount } };
}

// ============================================================================
// Flow Analysis
// ============================================================================

export type FlowAnalysis = {
  summary: string;
  tabs: Array<{ id: string; label: string; nodeCount: number; nodeTypes: Record<string, number> }>;
  totalNodes: number;
  uniqueNodeTypes: string[];
  hasHttpEndpoints: boolean;
  hasMqtt: boolean;
  hasDatabase: boolean;
  inputNodes: string[];
  outputNodes: string[];
};

export function analyzeFlow(flowItems: unknown[]): FlowAnalysis {
  const tabs: FlowAnalysis["tabs"] = [];
  const nodeTypeCount: Record<string, number> = {};
  const inputNodes: string[] = [];
  const outputNodes: string[] = [];
  let hasHttpEndpoints = false;
  let hasMqtt = false;
  let hasDatabase = false;
  const nodesByFlow: Record<string, Array<Record<string, unknown>>> = {};

  for (const item of flowItems) {
    const node = item as Record<string, unknown>;
    if (node.type === "tab") {
      tabs.push({ id: node.id as string, label: (node.label as string) || "Unnamed", nodeCount: 0, nodeTypes: {} });
      nodesByFlow[node.id as string] = [];
    }
  }

  for (const item of flowItems) {
    const node = item as Record<string, unknown>;
    const type = node.type as string;
    if (type === "tab" || type === "subflow") continue;

    const flowId = node.z as string;
    if (flowId && nodesByFlow[flowId]) nodesByFlow[flowId].push(node);

    nodeTypeCount[type] = (nodeTypeCount[type] || 0) + 1;

    const inputTypes = ["inject", "http in", "mqtt in", "websocket in", "tcp in", "udp in", "link in", "file in", "watch"];
    const outputTypes = ["debug", "http response", "mqtt out", "websocket out", "tcp out", "udp out", "link out", "file"];
    
    if (inputTypes.includes(type)) inputNodes.push(`${type}: ${node.name || node.id}`);
    if (outputTypes.includes(type)) outputNodes.push(`${type}: ${node.name || node.id}`);

    if (type.startsWith("http")) hasHttpEndpoints = true;
    if (type.startsWith("mqtt")) hasMqtt = true;
    if (["mysql", "postgresql", "mongodb", "redis", "sqlite"].some((db) => type.includes(db))) hasDatabase = true;
  }

  for (const tab of tabs) {
    const nodes = nodesByFlow[tab.id] || [];
    tab.nodeCount = nodes.length;
    for (const node of nodes) {
      const type = node.type as string;
      tab.nodeTypes[type] = (tab.nodeTypes[type] || 0) + 1;
    }
  }

  const totalNodes = Object.values(nodeTypeCount).reduce((a, b) => a + b, 0);
  const uniqueNodeTypes = Object.keys(nodeTypeCount).sort();

  const summaryParts: string[] = [`전체 ${tabs.length}개 탭, ${totalNodes}개 노드`];
  if (hasHttpEndpoints) summaryParts.push("HTTP API 포함");
  if (hasMqtt) summaryParts.push("MQTT 통신 포함");
  if (hasDatabase) summaryParts.push("데이터베이스 연동 포함");

  const topTypes = Object.entries(nodeTypeCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([type, count]) => `${type}(${count})`)
    .join(", ");
  if (topTypes) summaryParts.push(`주요 노드: ${topTypes}`);

  return {
    summary: summaryParts.join(". "),
    tabs,
    totalNodes,
    uniqueNodeTypes,
    hasHttpEndpoints,
    hasMqtt,
    hasDatabase,
    inputNodes,
    outputNodes,
  };
}
