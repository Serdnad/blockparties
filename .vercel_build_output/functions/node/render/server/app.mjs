import {randomBytes, createHash} from "crypto";
import http from "http";
import https from "https";
import zlib from "zlib";
import Stream, {PassThrough, pipeline} from "stream";
import {types} from "util";
import {format, parse, resolve, URLSearchParams as URLSearchParams$1} from "url";
var chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_$";
var unsafeChars = /[<>\b\f\n\r\t\0\u2028\u2029]/g;
var reserved = /^(?:do|if|in|for|int|let|new|try|var|byte|case|char|else|enum|goto|long|this|void|with|await|break|catch|class|const|final|float|short|super|throw|while|yield|delete|double|export|import|native|return|switch|throws|typeof|boolean|default|extends|finally|package|private|abstract|continue|debugger|function|volatile|interface|protected|transient|implements|instanceof|synchronized)$/;
var escaped$1 = {
  "<": "\\u003C",
  ">": "\\u003E",
  "/": "\\u002F",
  "\\": "\\\\",
  "\b": "\\b",
  "\f": "\\f",
  "\n": "\\n",
  "\r": "\\r",
  "	": "\\t",
  "\0": "\\0",
  "\u2028": "\\u2028",
  "\u2029": "\\u2029"
};
var objectProtoOwnPropertyNames = Object.getOwnPropertyNames(Object.prototype).sort().join("\0");
function devalue(value) {
  var counts = new Map();
  function walk(thing) {
    if (typeof thing === "function") {
      throw new Error("Cannot stringify a function");
    }
    if (counts.has(thing)) {
      counts.set(thing, counts.get(thing) + 1);
      return;
    }
    counts.set(thing, 1);
    if (!isPrimitive(thing)) {
      var type = getType(thing);
      switch (type) {
        case "Number":
        case "String":
        case "Boolean":
        case "Date":
        case "RegExp":
          return;
        case "Array":
          thing.forEach(walk);
          break;
        case "Set":
        case "Map":
          Array.from(thing).forEach(walk);
          break;
        default:
          var proto = Object.getPrototypeOf(thing);
          if (proto !== Object.prototype && proto !== null && Object.getOwnPropertyNames(proto).sort().join("\0") !== objectProtoOwnPropertyNames) {
            throw new Error("Cannot stringify arbitrary non-POJOs");
          }
          if (Object.getOwnPropertySymbols(thing).length > 0) {
            throw new Error("Cannot stringify POJOs with symbolic keys");
          }
          Object.keys(thing).forEach(function(key) {
            return walk(thing[key]);
          });
      }
    }
  }
  walk(value);
  var names = new Map();
  Array.from(counts).filter(function(entry) {
    return entry[1] > 1;
  }).sort(function(a, b) {
    return b[1] - a[1];
  }).forEach(function(entry, i) {
    names.set(entry[0], getName(i));
  });
  function stringify(thing) {
    if (names.has(thing)) {
      return names.get(thing);
    }
    if (isPrimitive(thing)) {
      return stringifyPrimitive(thing);
    }
    var type = getType(thing);
    switch (type) {
      case "Number":
      case "String":
      case "Boolean":
        return "Object(" + stringify(thing.valueOf()) + ")";
      case "RegExp":
        return "new RegExp(" + stringifyString(thing.source) + ', "' + thing.flags + '")';
      case "Date":
        return "new Date(" + thing.getTime() + ")";
      case "Array":
        var members = thing.map(function(v, i) {
          return i in thing ? stringify(v) : "";
        });
        var tail = thing.length === 0 || thing.length - 1 in thing ? "" : ",";
        return "[" + members.join(",") + tail + "]";
      case "Set":
      case "Map":
        return "new " + type + "([" + Array.from(thing).map(stringify).join(",") + "])";
      default:
        var obj = "{" + Object.keys(thing).map(function(key) {
          return safeKey(key) + ":" + stringify(thing[key]);
        }).join(",") + "}";
        var proto = Object.getPrototypeOf(thing);
        if (proto === null) {
          return Object.keys(thing).length > 0 ? "Object.assign(Object.create(null)," + obj + ")" : "Object.create(null)";
        }
        return obj;
    }
  }
  var str = stringify(value);
  if (names.size) {
    var params_1 = [];
    var statements_1 = [];
    var values_1 = [];
    names.forEach(function(name, thing) {
      params_1.push(name);
      if (isPrimitive(thing)) {
        values_1.push(stringifyPrimitive(thing));
        return;
      }
      var type = getType(thing);
      switch (type) {
        case "Number":
        case "String":
        case "Boolean":
          values_1.push("Object(" + stringify(thing.valueOf()) + ")");
          break;
        case "RegExp":
          values_1.push(thing.toString());
          break;
        case "Date":
          values_1.push("new Date(" + thing.getTime() + ")");
          break;
        case "Array":
          values_1.push("Array(" + thing.length + ")");
          thing.forEach(function(v, i) {
            statements_1.push(name + "[" + i + "]=" + stringify(v));
          });
          break;
        case "Set":
          values_1.push("new Set");
          statements_1.push(name + "." + Array.from(thing).map(function(v) {
            return "add(" + stringify(v) + ")";
          }).join("."));
          break;
        case "Map":
          values_1.push("new Map");
          statements_1.push(name + "." + Array.from(thing).map(function(_a) {
            var k = _a[0], v = _a[1];
            return "set(" + stringify(k) + ", " + stringify(v) + ")";
          }).join("."));
          break;
        default:
          values_1.push(Object.getPrototypeOf(thing) === null ? "Object.create(null)" : "{}");
          Object.keys(thing).forEach(function(key) {
            statements_1.push("" + name + safeProp(key) + "=" + stringify(thing[key]));
          });
      }
    });
    statements_1.push("return " + str);
    return "(function(" + params_1.join(",") + "){" + statements_1.join(";") + "}(" + values_1.join(",") + "))";
  } else {
    return str;
  }
}
function getName(num) {
  var name = "";
  do {
    name = chars[num % chars.length] + name;
    num = ~~(num / chars.length) - 1;
  } while (num >= 0);
  return reserved.test(name) ? name + "_" : name;
}
function isPrimitive(thing) {
  return Object(thing) !== thing;
}
function stringifyPrimitive(thing) {
  if (typeof thing === "string")
    return stringifyString(thing);
  if (thing === void 0)
    return "void 0";
  if (thing === 0 && 1 / thing < 0)
    return "-0";
  var str = String(thing);
  if (typeof thing === "number")
    return str.replace(/^(-)?0\./, "$1.");
  return str;
}
function getType(thing) {
  return Object.prototype.toString.call(thing).slice(8, -1);
}
function escapeUnsafeChar(c) {
  return escaped$1[c] || c;
}
function escapeUnsafeChars(str) {
  return str.replace(unsafeChars, escapeUnsafeChar);
}
function safeKey(key) {
  return /^[_$a-zA-Z][_$a-zA-Z0-9]*$/.test(key) ? key : escapeUnsafeChars(JSON.stringify(key));
}
function safeProp(key) {
  return /^[_$a-zA-Z][_$a-zA-Z0-9]*$/.test(key) ? "." + key : "[" + escapeUnsafeChars(JSON.stringify(key)) + "]";
}
function stringifyString(str) {
  var result = '"';
  for (var i = 0; i < str.length; i += 1) {
    var char = str.charAt(i);
    var code = char.charCodeAt(0);
    if (char === '"') {
      result += '\\"';
    } else if (char in escaped$1) {
      result += escaped$1[char];
    } else if (code >= 55296 && code <= 57343) {
      var next = str.charCodeAt(i + 1);
      if (code <= 56319 && (next >= 56320 && next <= 57343)) {
        result += char + str[++i];
      } else {
        result += "\\u" + code.toString(16).toUpperCase();
      }
    } else {
      result += char;
    }
  }
  result += '"';
  return result;
}
function dataUriToBuffer(uri) {
  if (!/^data:/i.test(uri)) {
    throw new TypeError('`uri` does not appear to be a Data URI (must begin with "data:")');
  }
  uri = uri.replace(/\r?\n/g, "");
  const firstComma = uri.indexOf(",");
  if (firstComma === -1 || firstComma <= 4) {
    throw new TypeError("malformed data: URI");
  }
  const meta = uri.substring(5, firstComma).split(";");
  let charset = "";
  let base64 = false;
  const type = meta[0] || "text/plain";
  let typeFull = type;
  for (let i = 1; i < meta.length; i++) {
    if (meta[i] === "base64") {
      base64 = true;
    } else {
      typeFull += `;${meta[i]}`;
      if (meta[i].indexOf("charset=") === 0) {
        charset = meta[i].substring(8);
      }
    }
  }
  if (!meta[0] && !charset.length) {
    typeFull += ";charset=US-ASCII";
    charset = "US-ASCII";
  }
  const encoding = base64 ? "base64" : "ascii";
  const data = unescape(uri.substring(firstComma + 1));
  const buffer = Buffer.from(data, encoding);
  buffer.type = type;
  buffer.typeFull = typeFull;
  buffer.charset = charset;
  return buffer;
}
var src = dataUriToBuffer;
const {Readable} = Stream;
const wm = new WeakMap();
async function* read(parts) {
  for (const part of parts) {
    if ("stream" in part) {
      yield* part.stream();
    } else {
      yield part;
    }
  }
}
class Blob {
  constructor(blobParts = [], options = {type: ""}) {
    let size = 0;
    const parts = blobParts.map((element) => {
      let buffer;
      if (element instanceof Buffer) {
        buffer = element;
      } else if (ArrayBuffer.isView(element)) {
        buffer = Buffer.from(element.buffer, element.byteOffset, element.byteLength);
      } else if (element instanceof ArrayBuffer) {
        buffer = Buffer.from(element);
      } else if (element instanceof Blob) {
        buffer = element;
      } else {
        buffer = Buffer.from(typeof element === "string" ? element : String(element));
      }
      size += buffer.length || buffer.size || 0;
      return buffer;
    });
    const type = options.type === void 0 ? "" : String(options.type).toLowerCase();
    wm.set(this, {
      type: /[^\u0020-\u007E]/.test(type) ? "" : type,
      size,
      parts
    });
  }
  get size() {
    return wm.get(this).size;
  }
  get type() {
    return wm.get(this).type;
  }
  async text() {
    return Buffer.from(await this.arrayBuffer()).toString();
  }
  async arrayBuffer() {
    const data = new Uint8Array(this.size);
    let offset = 0;
    for await (const chunk of this.stream()) {
      data.set(chunk, offset);
      offset += chunk.length;
    }
    return data.buffer;
  }
  stream() {
    return Readable.from(read(wm.get(this).parts));
  }
  slice(start = 0, end = this.size, type = "") {
    const {size} = this;
    let relativeStart = start < 0 ? Math.max(size + start, 0) : Math.min(start, size);
    let relativeEnd = end < 0 ? Math.max(size + end, 0) : Math.min(end, size);
    const span = Math.max(relativeEnd - relativeStart, 0);
    const parts = wm.get(this).parts.values();
    const blobParts = [];
    let added = 0;
    for (const part of parts) {
      const size2 = ArrayBuffer.isView(part) ? part.byteLength : part.size;
      if (relativeStart && size2 <= relativeStart) {
        relativeStart -= size2;
        relativeEnd -= size2;
      } else {
        const chunk = part.slice(relativeStart, Math.min(size2, relativeEnd));
        blobParts.push(chunk);
        added += ArrayBuffer.isView(chunk) ? chunk.byteLength : chunk.size;
        relativeStart = 0;
        if (added >= span) {
          break;
        }
      }
    }
    const blob = new Blob([], {type});
    Object.assign(wm.get(blob), {size: span, parts: blobParts});
    return blob;
  }
  get [Symbol.toStringTag]() {
    return "Blob";
  }
  static [Symbol.hasInstance](object) {
    return typeof object === "object" && typeof object.stream === "function" && object.stream.length === 0 && typeof object.constructor === "function" && /^(Blob|File)$/.test(object[Symbol.toStringTag]);
  }
}
Object.defineProperties(Blob.prototype, {
  size: {enumerable: true},
  type: {enumerable: true},
  slice: {enumerable: true}
});
var fetchBlob = Blob;
class FetchBaseError extends Error {
  constructor(message, type) {
    super(message);
    Error.captureStackTrace(this, this.constructor);
    this.type = type;
  }
  get name() {
    return this.constructor.name;
  }
  get [Symbol.toStringTag]() {
    return this.constructor.name;
  }
}
class FetchError extends FetchBaseError {
  constructor(message, type, systemError) {
    super(message, type);
    if (systemError) {
      this.code = this.errno = systemError.code;
      this.erroredSysCall = systemError.syscall;
    }
  }
}
const NAME = Symbol.toStringTag;
const isURLSearchParameters = (object) => {
  return typeof object === "object" && typeof object.append === "function" && typeof object.delete === "function" && typeof object.get === "function" && typeof object.getAll === "function" && typeof object.has === "function" && typeof object.set === "function" && typeof object.sort === "function" && object[NAME] === "URLSearchParams";
};
const isBlob = (object) => {
  return typeof object === "object" && typeof object.arrayBuffer === "function" && typeof object.type === "string" && typeof object.stream === "function" && typeof object.constructor === "function" && /^(Blob|File)$/.test(object[NAME]);
};
function isFormData(object) {
  return typeof object === "object" && typeof object.append === "function" && typeof object.set === "function" && typeof object.get === "function" && typeof object.getAll === "function" && typeof object.delete === "function" && typeof object.keys === "function" && typeof object.values === "function" && typeof object.entries === "function" && typeof object.constructor === "function" && object[NAME] === "FormData";
}
const isAbortSignal = (object) => {
  return typeof object === "object" && object[NAME] === "AbortSignal";
};
const carriage = "\r\n";
const dashes = "-".repeat(2);
const carriageLength = Buffer.byteLength(carriage);
const getFooter = (boundary) => `${dashes}${boundary}${dashes}${carriage.repeat(2)}`;
function getHeader(boundary, name, field) {
  let header = "";
  header += `${dashes}${boundary}${carriage}`;
  header += `Content-Disposition: form-data; name="${name}"`;
  if (isBlob(field)) {
    header += `; filename="${field.name}"${carriage}`;
    header += `Content-Type: ${field.type || "application/octet-stream"}`;
  }
  return `${header}${carriage.repeat(2)}`;
}
const getBoundary = () => randomBytes(8).toString("hex");
async function* formDataIterator(form, boundary) {
  for (const [name, value] of form) {
    yield getHeader(boundary, name, value);
    if (isBlob(value)) {
      yield* value.stream();
    } else {
      yield value;
    }
    yield carriage;
  }
  yield getFooter(boundary);
}
function getFormDataLength(form, boundary) {
  let length = 0;
  for (const [name, value] of form) {
    length += Buffer.byteLength(getHeader(boundary, name, value));
    if (isBlob(value)) {
      length += value.size;
    } else {
      length += Buffer.byteLength(String(value));
    }
    length += carriageLength;
  }
  length += Buffer.byteLength(getFooter(boundary));
  return length;
}
const INTERNALS$2 = Symbol("Body internals");
class Body {
  constructor(body, {
    size = 0
  } = {}) {
    let boundary = null;
    if (body === null) {
      body = null;
    } else if (isURLSearchParameters(body)) {
      body = Buffer.from(body.toString());
    } else if (isBlob(body))
      ;
    else if (Buffer.isBuffer(body))
      ;
    else if (types.isAnyArrayBuffer(body)) {
      body = Buffer.from(body);
    } else if (ArrayBuffer.isView(body)) {
      body = Buffer.from(body.buffer, body.byteOffset, body.byteLength);
    } else if (body instanceof Stream)
      ;
    else if (isFormData(body)) {
      boundary = `NodeFetchFormDataBoundary${getBoundary()}`;
      body = Stream.Readable.from(formDataIterator(body, boundary));
    } else {
      body = Buffer.from(String(body));
    }
    this[INTERNALS$2] = {
      body,
      boundary,
      disturbed: false,
      error: null
    };
    this.size = size;
    if (body instanceof Stream) {
      body.on("error", (err) => {
        const error2 = err instanceof FetchBaseError ? err : new FetchError(`Invalid response body while trying to fetch ${this.url}: ${err.message}`, "system", err);
        this[INTERNALS$2].error = error2;
      });
    }
  }
  get body() {
    return this[INTERNALS$2].body;
  }
  get bodyUsed() {
    return this[INTERNALS$2].disturbed;
  }
  async arrayBuffer() {
    const {buffer, byteOffset, byteLength} = await consumeBody(this);
    return buffer.slice(byteOffset, byteOffset + byteLength);
  }
  async blob() {
    const ct = this.headers && this.headers.get("content-type") || this[INTERNALS$2].body && this[INTERNALS$2].body.type || "";
    const buf = await this.buffer();
    return new fetchBlob([buf], {
      type: ct
    });
  }
  async json() {
    const buffer = await consumeBody(this);
    return JSON.parse(buffer.toString());
  }
  async text() {
    const buffer = await consumeBody(this);
    return buffer.toString();
  }
  buffer() {
    return consumeBody(this);
  }
}
Object.defineProperties(Body.prototype, {
  body: {enumerable: true},
  bodyUsed: {enumerable: true},
  arrayBuffer: {enumerable: true},
  blob: {enumerable: true},
  json: {enumerable: true},
  text: {enumerable: true}
});
async function consumeBody(data) {
  if (data[INTERNALS$2].disturbed) {
    throw new TypeError(`body used already for: ${data.url}`);
  }
  data[INTERNALS$2].disturbed = true;
  if (data[INTERNALS$2].error) {
    throw data[INTERNALS$2].error;
  }
  let {body} = data;
  if (body === null) {
    return Buffer.alloc(0);
  }
  if (isBlob(body)) {
    body = body.stream();
  }
  if (Buffer.isBuffer(body)) {
    return body;
  }
  if (!(body instanceof Stream)) {
    return Buffer.alloc(0);
  }
  const accum = [];
  let accumBytes = 0;
  try {
    for await (const chunk of body) {
      if (data.size > 0 && accumBytes + chunk.length > data.size) {
        const err = new FetchError(`content size at ${data.url} over limit: ${data.size}`, "max-size");
        body.destroy(err);
        throw err;
      }
      accumBytes += chunk.length;
      accum.push(chunk);
    }
  } catch (error2) {
    if (error2 instanceof FetchBaseError) {
      throw error2;
    } else {
      throw new FetchError(`Invalid response body while trying to fetch ${data.url}: ${error2.message}`, "system", error2);
    }
  }
  if (body.readableEnded === true || body._readableState.ended === true) {
    try {
      if (accum.every((c) => typeof c === "string")) {
        return Buffer.from(accum.join(""));
      }
      return Buffer.concat(accum, accumBytes);
    } catch (error2) {
      throw new FetchError(`Could not create Buffer from response body for ${data.url}: ${error2.message}`, "system", error2);
    }
  } else {
    throw new FetchError(`Premature close of server response while trying to fetch ${data.url}`);
  }
}
const clone = (instance, highWaterMark) => {
  let p1;
  let p2;
  let {body} = instance;
  if (instance.bodyUsed) {
    throw new Error("cannot clone body after it is used");
  }
  if (body instanceof Stream && typeof body.getBoundary !== "function") {
    p1 = new PassThrough({highWaterMark});
    p2 = new PassThrough({highWaterMark});
    body.pipe(p1);
    body.pipe(p2);
    instance[INTERNALS$2].body = p1;
    body = p2;
  }
  return body;
};
const extractContentType = (body, request) => {
  if (body === null) {
    return null;
  }
  if (typeof body === "string") {
    return "text/plain;charset=UTF-8";
  }
  if (isURLSearchParameters(body)) {
    return "application/x-www-form-urlencoded;charset=UTF-8";
  }
  if (isBlob(body)) {
    return body.type || null;
  }
  if (Buffer.isBuffer(body) || types.isAnyArrayBuffer(body) || ArrayBuffer.isView(body)) {
    return null;
  }
  if (body && typeof body.getBoundary === "function") {
    return `multipart/form-data;boundary=${body.getBoundary()}`;
  }
  if (isFormData(body)) {
    return `multipart/form-data; boundary=${request[INTERNALS$2].boundary}`;
  }
  if (body instanceof Stream) {
    return null;
  }
  return "text/plain;charset=UTF-8";
};
const getTotalBytes = (request) => {
  const {body} = request;
  if (body === null) {
    return 0;
  }
  if (isBlob(body)) {
    return body.size;
  }
  if (Buffer.isBuffer(body)) {
    return body.length;
  }
  if (body && typeof body.getLengthSync === "function") {
    return body.hasKnownLength && body.hasKnownLength() ? body.getLengthSync() : null;
  }
  if (isFormData(body)) {
    return getFormDataLength(request[INTERNALS$2].boundary);
  }
  return null;
};
const writeToStream = (dest, {body}) => {
  if (body === null) {
    dest.end();
  } else if (isBlob(body)) {
    body.stream().pipe(dest);
  } else if (Buffer.isBuffer(body)) {
    dest.write(body);
    dest.end();
  } else {
    body.pipe(dest);
  }
};
const validateHeaderName = typeof http.validateHeaderName === "function" ? http.validateHeaderName : (name) => {
  if (!/^[\^`\-\w!#$%&'*+.|~]+$/.test(name)) {
    const err = new TypeError(`Header name must be a valid HTTP token [${name}]`);
    Object.defineProperty(err, "code", {value: "ERR_INVALID_HTTP_TOKEN"});
    throw err;
  }
};
const validateHeaderValue = typeof http.validateHeaderValue === "function" ? http.validateHeaderValue : (name, value) => {
  if (/[^\t\u0020-\u007E\u0080-\u00FF]/.test(value)) {
    const err = new TypeError(`Invalid character in header content ["${name}"]`);
    Object.defineProperty(err, "code", {value: "ERR_INVALID_CHAR"});
    throw err;
  }
};
class Headers extends URLSearchParams {
  constructor(init2) {
    let result = [];
    if (init2 instanceof Headers) {
      const raw = init2.raw();
      for (const [name, values] of Object.entries(raw)) {
        result.push(...values.map((value) => [name, value]));
      }
    } else if (init2 == null)
      ;
    else if (typeof init2 === "object" && !types.isBoxedPrimitive(init2)) {
      const method = init2[Symbol.iterator];
      if (method == null) {
        result.push(...Object.entries(init2));
      } else {
        if (typeof method !== "function") {
          throw new TypeError("Header pairs must be iterable");
        }
        result = [...init2].map((pair) => {
          if (typeof pair !== "object" || types.isBoxedPrimitive(pair)) {
            throw new TypeError("Each header pair must be an iterable object");
          }
          return [...pair];
        }).map((pair) => {
          if (pair.length !== 2) {
            throw new TypeError("Each header pair must be a name/value tuple");
          }
          return [...pair];
        });
      }
    } else {
      throw new TypeError("Failed to construct 'Headers': The provided value is not of type '(sequence<sequence<ByteString>> or record<ByteString, ByteString>)");
    }
    result = result.length > 0 ? result.map(([name, value]) => {
      validateHeaderName(name);
      validateHeaderValue(name, String(value));
      return [String(name).toLowerCase(), String(value)];
    }) : void 0;
    super(result);
    return new Proxy(this, {
      get(target, p, receiver) {
        switch (p) {
          case "append":
          case "set":
            return (name, value) => {
              validateHeaderName(name);
              validateHeaderValue(name, String(value));
              return URLSearchParams.prototype[p].call(receiver, String(name).toLowerCase(), String(value));
            };
          case "delete":
          case "has":
          case "getAll":
            return (name) => {
              validateHeaderName(name);
              return URLSearchParams.prototype[p].call(receiver, String(name).toLowerCase());
            };
          case "keys":
            return () => {
              target.sort();
              return new Set(URLSearchParams.prototype.keys.call(target)).keys();
            };
          default:
            return Reflect.get(target, p, receiver);
        }
      }
    });
  }
  get [Symbol.toStringTag]() {
    return this.constructor.name;
  }
  toString() {
    return Object.prototype.toString.call(this);
  }
  get(name) {
    const values = this.getAll(name);
    if (values.length === 0) {
      return null;
    }
    let value = values.join(", ");
    if (/^content-encoding$/i.test(name)) {
      value = value.toLowerCase();
    }
    return value;
  }
  forEach(callback) {
    for (const name of this.keys()) {
      callback(this.get(name), name);
    }
  }
  *values() {
    for (const name of this.keys()) {
      yield this.get(name);
    }
  }
  *entries() {
    for (const name of this.keys()) {
      yield [name, this.get(name)];
    }
  }
  [Symbol.iterator]() {
    return this.entries();
  }
  raw() {
    return [...this.keys()].reduce((result, key) => {
      result[key] = this.getAll(key);
      return result;
    }, {});
  }
  [Symbol.for("nodejs.util.inspect.custom")]() {
    return [...this.keys()].reduce((result, key) => {
      const values = this.getAll(key);
      if (key === "host") {
        result[key] = values[0];
      } else {
        result[key] = values.length > 1 ? values : values[0];
      }
      return result;
    }, {});
  }
}
Object.defineProperties(Headers.prototype, ["get", "entries", "forEach", "values"].reduce((result, property) => {
  result[property] = {enumerable: true};
  return result;
}, {}));
function fromRawHeaders(headers = []) {
  return new Headers(headers.reduce((result, value, index2, array) => {
    if (index2 % 2 === 0) {
      result.push(array.slice(index2, index2 + 2));
    }
    return result;
  }, []).filter(([name, value]) => {
    try {
      validateHeaderName(name);
      validateHeaderValue(name, String(value));
      return true;
    } catch (e) {
      return false;
    }
  }));
}
const redirectStatus = new Set([301, 302, 303, 307, 308]);
const isRedirect = (code) => {
  return redirectStatus.has(code);
};
const INTERNALS$1 = Symbol("Response internals");
class Response extends Body {
  constructor(body = null, options = {}) {
    super(body, options);
    const status = options.status || 200;
    const headers = new Headers(options.headers);
    if (body !== null && !headers.has("Content-Type")) {
      const contentType = extractContentType(body);
      if (contentType) {
        headers.append("Content-Type", contentType);
      }
    }
    this[INTERNALS$1] = {
      url: options.url,
      status,
      statusText: options.statusText || "",
      headers,
      counter: options.counter,
      highWaterMark: options.highWaterMark
    };
  }
  get url() {
    return this[INTERNALS$1].url || "";
  }
  get status() {
    return this[INTERNALS$1].status;
  }
  get ok() {
    return this[INTERNALS$1].status >= 200 && this[INTERNALS$1].status < 300;
  }
  get redirected() {
    return this[INTERNALS$1].counter > 0;
  }
  get statusText() {
    return this[INTERNALS$1].statusText;
  }
  get headers() {
    return this[INTERNALS$1].headers;
  }
  get highWaterMark() {
    return this[INTERNALS$1].highWaterMark;
  }
  clone() {
    return new Response(clone(this, this.highWaterMark), {
      url: this.url,
      status: this.status,
      statusText: this.statusText,
      headers: this.headers,
      ok: this.ok,
      redirected: this.redirected,
      size: this.size
    });
  }
  static redirect(url, status = 302) {
    if (!isRedirect(status)) {
      throw new RangeError('Failed to execute "redirect" on "response": Invalid status code');
    }
    return new Response(null, {
      headers: {
        location: new URL(url).toString()
      },
      status
    });
  }
  get [Symbol.toStringTag]() {
    return "Response";
  }
}
Object.defineProperties(Response.prototype, {
  url: {enumerable: true},
  status: {enumerable: true},
  ok: {enumerable: true},
  redirected: {enumerable: true},
  statusText: {enumerable: true},
  headers: {enumerable: true},
  clone: {enumerable: true}
});
const getSearch = (parsedURL) => {
  if (parsedURL.search) {
    return parsedURL.search;
  }
  const lastOffset = parsedURL.href.length - 1;
  const hash = parsedURL.hash || (parsedURL.href[lastOffset] === "#" ? "#" : "");
  return parsedURL.href[lastOffset - hash.length] === "?" ? "?" : "";
};
const INTERNALS = Symbol("Request internals");
const isRequest = (object) => {
  return typeof object === "object" && typeof object[INTERNALS] === "object";
};
class Request extends Body {
  constructor(input, init2 = {}) {
    let parsedURL;
    if (isRequest(input)) {
      parsedURL = new URL(input.url);
    } else {
      parsedURL = new URL(input);
      input = {};
    }
    let method = init2.method || input.method || "GET";
    method = method.toUpperCase();
    if ((init2.body != null || isRequest(input)) && input.body !== null && (method === "GET" || method === "HEAD")) {
      throw new TypeError("Request with GET/HEAD method cannot have body");
    }
    const inputBody = init2.body ? init2.body : isRequest(input) && input.body !== null ? clone(input) : null;
    super(inputBody, {
      size: init2.size || input.size || 0
    });
    const headers = new Headers(init2.headers || input.headers || {});
    if (inputBody !== null && !headers.has("Content-Type")) {
      const contentType = extractContentType(inputBody, this);
      if (contentType) {
        headers.append("Content-Type", contentType);
      }
    }
    let signal = isRequest(input) ? input.signal : null;
    if ("signal" in init2) {
      signal = init2.signal;
    }
    if (signal !== null && !isAbortSignal(signal)) {
      throw new TypeError("Expected signal to be an instanceof AbortSignal");
    }
    this[INTERNALS] = {
      method,
      redirect: init2.redirect || input.redirect || "follow",
      headers,
      parsedURL,
      signal
    };
    this.follow = init2.follow === void 0 ? input.follow === void 0 ? 20 : input.follow : init2.follow;
    this.compress = init2.compress === void 0 ? input.compress === void 0 ? true : input.compress : init2.compress;
    this.counter = init2.counter || input.counter || 0;
    this.agent = init2.agent || input.agent;
    this.highWaterMark = init2.highWaterMark || input.highWaterMark || 16384;
    this.insecureHTTPParser = init2.insecureHTTPParser || input.insecureHTTPParser || false;
  }
  get method() {
    return this[INTERNALS].method;
  }
  get url() {
    return format(this[INTERNALS].parsedURL);
  }
  get headers() {
    return this[INTERNALS].headers;
  }
  get redirect() {
    return this[INTERNALS].redirect;
  }
  get signal() {
    return this[INTERNALS].signal;
  }
  clone() {
    return new Request(this);
  }
  get [Symbol.toStringTag]() {
    return "Request";
  }
}
Object.defineProperties(Request.prototype, {
  method: {enumerable: true},
  url: {enumerable: true},
  headers: {enumerable: true},
  redirect: {enumerable: true},
  clone: {enumerable: true},
  signal: {enumerable: true}
});
const getNodeRequestOptions = (request) => {
  const {parsedURL} = request[INTERNALS];
  const headers = new Headers(request[INTERNALS].headers);
  if (!headers.has("Accept")) {
    headers.set("Accept", "*/*");
  }
  let contentLengthValue = null;
  if (request.body === null && /^(post|put)$/i.test(request.method)) {
    contentLengthValue = "0";
  }
  if (request.body !== null) {
    const totalBytes = getTotalBytes(request);
    if (typeof totalBytes === "number" && !Number.isNaN(totalBytes)) {
      contentLengthValue = String(totalBytes);
    }
  }
  if (contentLengthValue) {
    headers.set("Content-Length", contentLengthValue);
  }
  if (!headers.has("User-Agent")) {
    headers.set("User-Agent", "node-fetch");
  }
  if (request.compress && !headers.has("Accept-Encoding")) {
    headers.set("Accept-Encoding", "gzip,deflate,br");
  }
  let {agent} = request;
  if (typeof agent === "function") {
    agent = agent(parsedURL);
  }
  if (!headers.has("Connection") && !agent) {
    headers.set("Connection", "close");
  }
  const search = getSearch(parsedURL);
  const requestOptions = {
    path: parsedURL.pathname + search,
    pathname: parsedURL.pathname,
    hostname: parsedURL.hostname,
    protocol: parsedURL.protocol,
    port: parsedURL.port,
    hash: parsedURL.hash,
    search: parsedURL.search,
    query: parsedURL.query,
    href: parsedURL.href,
    method: request.method,
    headers: headers[Symbol.for("nodejs.util.inspect.custom")](),
    insecureHTTPParser: request.insecureHTTPParser,
    agent
  };
  return requestOptions;
};
class AbortError extends FetchBaseError {
  constructor(message, type = "aborted") {
    super(message, type);
  }
}
const supportedSchemas = new Set(["data:", "http:", "https:"]);
async function fetch(url, options_) {
  return new Promise((resolve2, reject) => {
    const request = new Request(url, options_);
    const options = getNodeRequestOptions(request);
    if (!supportedSchemas.has(options.protocol)) {
      throw new TypeError(`node-fetch cannot load ${url}. URL scheme "${options.protocol.replace(/:$/, "")}" is not supported.`);
    }
    if (options.protocol === "data:") {
      const data = src(request.url);
      const response2 = new Response(data, {headers: {"Content-Type": data.typeFull}});
      resolve2(response2);
      return;
    }
    const send = (options.protocol === "https:" ? https : http).request;
    const {signal} = request;
    let response = null;
    const abort = () => {
      const error2 = new AbortError("The operation was aborted.");
      reject(error2);
      if (request.body && request.body instanceof Stream.Readable) {
        request.body.destroy(error2);
      }
      if (!response || !response.body) {
        return;
      }
      response.body.emit("error", error2);
    };
    if (signal && signal.aborted) {
      abort();
      return;
    }
    const abortAndFinalize = () => {
      abort();
      finalize();
    };
    const request_ = send(options);
    if (signal) {
      signal.addEventListener("abort", abortAndFinalize);
    }
    const finalize = () => {
      request_.abort();
      if (signal) {
        signal.removeEventListener("abort", abortAndFinalize);
      }
    };
    request_.on("error", (err) => {
      reject(new FetchError(`request to ${request.url} failed, reason: ${err.message}`, "system", err));
      finalize();
    });
    request_.on("response", (response_) => {
      request_.setTimeout(0);
      const headers = fromRawHeaders(response_.rawHeaders);
      if (isRedirect(response_.statusCode)) {
        const location = headers.get("Location");
        const locationURL = location === null ? null : new URL(location, request.url);
        switch (request.redirect) {
          case "error":
            reject(new FetchError(`uri requested responds with a redirect, redirect mode is set to error: ${request.url}`, "no-redirect"));
            finalize();
            return;
          case "manual":
            if (locationURL !== null) {
              try {
                headers.set("Location", locationURL);
              } catch (error2) {
                reject(error2);
              }
            }
            break;
          case "follow": {
            if (locationURL === null) {
              break;
            }
            if (request.counter >= request.follow) {
              reject(new FetchError(`maximum redirect reached at: ${request.url}`, "max-redirect"));
              finalize();
              return;
            }
            const requestOptions = {
              headers: new Headers(request.headers),
              follow: request.follow,
              counter: request.counter + 1,
              agent: request.agent,
              compress: request.compress,
              method: request.method,
              body: request.body,
              signal: request.signal,
              size: request.size
            };
            if (response_.statusCode !== 303 && request.body && options_.body instanceof Stream.Readable) {
              reject(new FetchError("Cannot follow redirect with body being a readable stream", "unsupported-redirect"));
              finalize();
              return;
            }
            if (response_.statusCode === 303 || (response_.statusCode === 301 || response_.statusCode === 302) && request.method === "POST") {
              requestOptions.method = "GET";
              requestOptions.body = void 0;
              requestOptions.headers.delete("content-length");
            }
            resolve2(fetch(new Request(locationURL, requestOptions)));
            finalize();
            return;
          }
        }
      }
      response_.once("end", () => {
        if (signal) {
          signal.removeEventListener("abort", abortAndFinalize);
        }
      });
      let body = pipeline(response_, new PassThrough(), (error2) => {
        reject(error2);
      });
      if (process.version < "v12.10") {
        response_.on("aborted", abortAndFinalize);
      }
      const responseOptions = {
        url: request.url,
        status: response_.statusCode,
        statusText: response_.statusMessage,
        headers,
        size: request.size,
        counter: request.counter,
        highWaterMark: request.highWaterMark
      };
      const codings = headers.get("Content-Encoding");
      if (!request.compress || request.method === "HEAD" || codings === null || response_.statusCode === 204 || response_.statusCode === 304) {
        response = new Response(body, responseOptions);
        resolve2(response);
        return;
      }
      const zlibOptions = {
        flush: zlib.Z_SYNC_FLUSH,
        finishFlush: zlib.Z_SYNC_FLUSH
      };
      if (codings === "gzip" || codings === "x-gzip") {
        body = pipeline(body, zlib.createGunzip(zlibOptions), (error2) => {
          reject(error2);
        });
        response = new Response(body, responseOptions);
        resolve2(response);
        return;
      }
      if (codings === "deflate" || codings === "x-deflate") {
        const raw = pipeline(response_, new PassThrough(), (error2) => {
          reject(error2);
        });
        raw.once("data", (chunk) => {
          if ((chunk[0] & 15) === 8) {
            body = pipeline(body, zlib.createInflate(), (error2) => {
              reject(error2);
            });
          } else {
            body = pipeline(body, zlib.createInflateRaw(), (error2) => {
              reject(error2);
            });
          }
          response = new Response(body, responseOptions);
          resolve2(response);
        });
        return;
      }
      if (codings === "br") {
        body = pipeline(body, zlib.createBrotliDecompress(), (error2) => {
          reject(error2);
        });
        response = new Response(body, responseOptions);
        resolve2(response);
        return;
      }
      response = new Response(body, responseOptions);
      resolve2(response);
    });
    writeToStream(request_, request);
  });
}
function noop() {
}
function safe_not_equal(a, b) {
  return a != a ? b == b : a !== b || (a && typeof a === "object" || typeof a === "function");
}
const subscriber_queue = [];
function writable(value, start = noop) {
  let stop;
  const subscribers = [];
  function set(new_value) {
    if (safe_not_equal(value, new_value)) {
      value = new_value;
      if (stop) {
        const run_queue = !subscriber_queue.length;
        for (let i = 0; i < subscribers.length; i += 1) {
          const s2 = subscribers[i];
          s2[1]();
          subscriber_queue.push(s2, value);
        }
        if (run_queue) {
          for (let i = 0; i < subscriber_queue.length; i += 2) {
            subscriber_queue[i][0](subscriber_queue[i + 1]);
          }
          subscriber_queue.length = 0;
        }
      }
    }
  }
  function update(fn) {
    set(fn(value));
  }
  function subscribe(run2, invalidate = noop) {
    const subscriber = [run2, invalidate];
    subscribers.push(subscriber);
    if (subscribers.length === 1) {
      stop = start(set) || noop;
    }
    run2(value);
    return () => {
      const index2 = subscribers.indexOf(subscriber);
      if (index2 !== -1) {
        subscribers.splice(index2, 1);
      }
      if (subscribers.length === 0) {
        stop();
        stop = null;
      }
    };
  }
  return {set, update, subscribe};
}
function normalize(loaded) {
  if (loaded.error) {
    const error2 = typeof loaded.error === "string" ? new Error(loaded.error) : loaded.error;
    const status = loaded.status;
    if (!(error2 instanceof Error)) {
      return {
        status: 500,
        error: new Error(`"error" property returned from load() must be a string or instance of Error, received type "${typeof error2}"`)
      };
    }
    if (!status || status < 400 || status > 599) {
      console.warn('"error" returned from load() without a valid status code \u2014 defaulting to 500');
      return {status: 500, error: error2};
    }
    return {status, error: error2};
  }
  if (loaded.redirect) {
    if (!loaded.status || Math.floor(loaded.status / 100) !== 3) {
      return {
        status: 500,
        error: new Error('"redirect" property returned from load() must be accompanied by a 3xx status code')
      };
    }
    if (typeof loaded.redirect !== "string") {
      return {
        status: 500,
        error: new Error('"redirect" property returned from load() must be a string')
      };
    }
  }
  return loaded;
}
const s = JSON.stringify;
async function get_response({request, options, $session, route, status = 200, error: error2}) {
  const dependencies = {};
  const serialized_session = try_serialize($session, (error3) => {
    throw new Error(`Failed to serialize session data: ${error3.message}`);
  });
  const serialized_data = [];
  const match = route && route.pattern.exec(request.path);
  const params = route && route.params(match);
  const page = {
    host: request.host,
    path: request.path,
    query: request.query,
    params
  };
  let uses_credentials = false;
  const fetcher = async (resource, opts = {}) => {
    let url;
    if (typeof resource === "string") {
      url = resource;
    } else {
      url = resource.url;
      opts = {
        method: resource.method,
        headers: resource.headers,
        body: resource.body,
        mode: resource.mode,
        credentials: resource.credentials,
        cache: resource.cache,
        redirect: resource.redirect,
        referrer: resource.referrer,
        integrity: resource.integrity,
        ...opts
      };
    }
    if (options.local && url.startsWith(options.paths.assets)) {
      url = url.replace(options.paths.assets, "");
    }
    const parsed = parse(url);
    if (opts.credentials !== "omit") {
      uses_credentials = true;
    }
    let response;
    if (parsed.protocol) {
      response = await fetch(parsed.href, opts);
    } else {
      const resolved = resolve(request.path, parsed.pathname);
      const filename = resolved.slice(1);
      const filename_html = `${filename}/index.html`;
      const asset = options.manifest.assets.find((d) => d.file === filename || d.file === filename_html);
      if (asset) {
        if (options.get_static_file) {
          response = new Response(options.get_static_file(asset.file), {
            headers: {
              "content-type": asset.type
            }
          });
        } else {
          response = await fetch(`http://${page.host}/${asset.file}`, opts);
        }
      }
      if (!response) {
        const rendered2 = await ssr({
          host: request.host,
          method: opts.method || "GET",
          headers: opts.headers || {},
          path: resolved,
          body: opts.body,
          query: new URLSearchParams$1(parsed.query || "")
        }, {
          ...options,
          fetched: url,
          initiator: route
        });
        if (rendered2) {
          dependencies[resolved] = rendered2;
          response = new Response(rendered2.body, {
            status: rendered2.status,
            headers: rendered2.headers
          });
        }
      }
    }
    if (response) {
      const headers2 = {};
      response.headers.forEach((value, key) => {
        if (key !== "etag")
          headers2[key] = value;
      });
      const inline = {
        url,
        payload: {
          status: response.status,
          statusText: response.statusText,
          headers: headers2,
          body: null
        }
      };
      const proxy = new Proxy(response, {
        get(response2, key, receiver) {
          if (key === "text") {
            return async () => {
              const text = await response2.text();
              inline.payload.body = text;
              serialized_data.push(inline);
              return text;
            };
          }
          if (key === "json") {
            return async () => {
              const json = await response2.json();
              inline.payload.body = s(json);
              serialized_data.push(inline);
              return json;
            };
          }
          return Reflect.get(response2, key, receiver);
        }
      });
      return proxy;
    }
    return new Response("Not found", {
      status: 404
    });
  };
  const component_promises = error2 ? [options.manifest.layout()] : [options.manifest.layout(), ...route.parts.map((part) => part.load())];
  const components2 = [];
  const props_promises = [];
  let context = {};
  let maxage;
  if (options.only_render_prerenderable_pages) {
    if (error2)
      return;
    const mod = await component_promises[component_promises.length - 1];
    if (!mod.prerender)
      return;
  }
  for (let i = 0; i < component_promises.length; i += 1) {
    let loaded;
    try {
      const mod = await component_promises[i];
      components2[i] = mod.default;
      if (mod.preload) {
        throw new Error("preload has been deprecated in favour of load. Please consult the documentation: https://kit.svelte.dev/docs#load");
      }
      if (mod.load) {
        loaded = await mod.load.call(null, {
          page,
          get session() {
            uses_credentials = true;
            return $session;
          },
          fetch: fetcher,
          context: {...context}
        });
        if (!loaded)
          return;
      }
    } catch (e) {
      if (error2)
        throw e instanceof Error ? e : new Error(e);
      loaded = {
        error: e instanceof Error ? e : {name: "Error", message: e.toString()},
        status: 500
      };
    }
    if (loaded) {
      loaded = normalize(loaded);
      if (loaded.error) {
        return await get_response({
          request,
          options,
          $session,
          route,
          status: loaded.status,
          error: loaded.error
        });
      }
      if (loaded.redirect) {
        return {
          status: loaded.status,
          headers: {
            location: loaded.redirect
          }
        };
      }
      if (loaded.context) {
        context = {
          ...context,
          ...loaded.context
        };
      }
      maxage = loaded.maxage || 0;
      props_promises[i] = loaded.props;
    }
  }
  const session = writable($session);
  let session_tracking_active = false;
  const unsubscribe = session.subscribe(() => {
    if (session_tracking_active)
      uses_credentials = true;
  });
  session_tracking_active = true;
  if (error2) {
    if (options.dev) {
      error2.stack = await options.get_stack(error2);
    } else {
      error2.stack = String(error2);
    }
  }
  const props = {
    status,
    error: error2,
    stores: {
      page: writable(null),
      navigating: writable(null),
      session
    },
    page,
    components: components2
  };
  for (let i = 0; i < props_promises.length; i += 1) {
    props[`props_${i}`] = await props_promises[i];
  }
  let rendered;
  try {
    rendered = options.root.render(props);
  } catch (e) {
    if (error2)
      throw e instanceof Error ? e : new Error(e);
    return await get_response({
      request,
      options,
      $session,
      route,
      status: 500,
      error: e instanceof Error ? e : {name: "Error", message: e.toString()}
    });
  }
  unsubscribe();
  const js_deps = route ? route.js : [];
  const css_deps = route ? route.css : [];
  const style = route ? route.style : "";
  const prefix = `${options.paths.assets}/${options.app_dir}`;
  const links = options.amp ? `<style amp-custom>${style || (await Promise.all(css_deps.map((dep) => options.get_amp_css(dep)))).join("\n")}</style>` : [
    ...js_deps.map((dep) => `<link rel="modulepreload" href="${prefix}/${dep}">`),
    ...css_deps.map((dep) => `<link rel="stylesheet" href="${prefix}/${dep}">`)
  ].join("\n			");
  const init2 = options.amp ? `
		<style amp-boilerplate>body{-webkit-animation:-amp-start 8s steps(1,end) 0s 1 normal both;-moz-animation:-amp-start 8s steps(1,end) 0s 1 normal both;-ms-animation:-amp-start 8s steps(1,end) 0s 1 normal both;animation:-amp-start 8s steps(1,end) 0s 1 normal both}@-webkit-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@-moz-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@-ms-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@-o-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}</style>
		<noscript><style amp-boilerplate>body{-webkit-animation:none;-moz-animation:none;-ms-animation:none;animation:none}</style></noscript>
		<script async src="https://cdn.ampproject.org/v0.js"></script>` : `
		<script type="module">
			import { start } from ${s(options.entry)};
			start({
				target: ${options.target ? `document.querySelector(${s(options.target)})` : "document.body"},
				paths: ${s(options.paths)},
				status: ${status},
				error: ${serialize_error(error2)},
				session: ${serialized_session},
				nodes: [
					${(route ? route.parts : []).map((part) => `import(${s(options.get_component_path(part.id))})`).join(",\n					")}
				],
				page: {
					host: ${s(request.host || "location.host")},
					path: ${s(request.path)},
					query: new URLSearchParams(${s(request.query.toString())}),
					params: ${s(params)}
				}
			});
		</script>`;
  const head = [
    rendered.head,
    style && !options.amp ? `<style data-svelte>${style}</style>` : "",
    links,
    init2
  ].join("\n\n");
  const body = options.amp ? rendered.html : `${rendered.html}

			${serialized_data.map(({url, payload}) => `<script type="svelte-data" url="${url}">${s(payload)}</script>`).join("\n\n			")}
		`.replace(/^\t{2}/gm, "");
  const headers = {
    "content-type": "text/html"
  };
  if (maxage) {
    headers["cache-control"] = `${uses_credentials ? "private" : "public"}, max-age=${maxage}`;
  }
  return {
    status,
    headers,
    body: options.template({head, body}),
    dependencies
  };
}
async function render_page(request, route, options) {
  if (options.initiator === route) {
    return {
      status: 404,
      headers: {},
      body: `Not found: ${request.path}`
    };
  }
  const $session = await options.hooks.getSession({context: request.context});
  const response = await get_response({
    request,
    options,
    $session,
    route,
    status: route ? 200 : 404,
    error: route ? null : new Error(`Not found: ${request.path}`)
  });
  if (response) {
    return response;
  }
  if (options.fetched) {
    return {
      status: 500,
      headers: {},
      body: `Bad request in load function: failed to fetch ${options.fetched}`
    };
  }
}
function try_serialize(data, fail) {
  try {
    return devalue(data);
  } catch (err) {
    if (fail)
      fail(err);
    return null;
  }
}
function serialize_error(error2) {
  if (!error2)
    return null;
  let serialized = try_serialize(error2);
  if (!serialized) {
    const {name, message, stack} = error2;
    serialized = try_serialize({name, message, stack});
  }
  if (!serialized) {
    serialized = "{}";
  }
  return serialized;
}
async function render_route(request, route) {
  const mod = await route.load();
  const handler = mod[request.method.toLowerCase().replace("delete", "del")];
  if (handler) {
    const match = route.pattern.exec(request.path);
    const params = route.params(match);
    const response = await handler({...request, params});
    if (response) {
      if (typeof response !== "object" || response.body == null) {
        return {
          status: 500,
          body: `Invalid response from route ${request.path}; ${response.body == null ? "body is missing" : `expected an object, got ${typeof response}`}`,
          headers: {}
        };
      }
      let {status = 200, body, headers = {}} = response;
      headers = lowercase_keys(headers);
      if (typeof body === "object" && !("content-type" in headers) || headers["content-type"] === "application/json") {
        headers = {...headers, "content-type": "application/json"};
        body = JSON.stringify(body);
      }
      return {status, body, headers};
    }
  }
}
function lowercase_keys(obj) {
  const clone2 = {};
  for (const key in obj) {
    clone2[key.toLowerCase()] = obj[key];
  }
  return clone2;
}
function md5(body) {
  return createHash("md5").update(body).digest("hex");
}
async function ssr(incoming, options) {
  if (incoming.path.endsWith("/") && incoming.path !== "/") {
    const q = incoming.query.toString();
    return {
      status: 301,
      headers: {
        location: incoming.path.slice(0, -1) + (q ? `?${q}` : "")
      }
    };
  }
  const context = await options.hooks.getContext(incoming) || {};
  try {
    return await options.hooks.handle({
      ...incoming,
      params: null,
      context
    }, async (request) => {
      for (const route of options.manifest.routes) {
        if (!route.pattern.test(request.path))
          continue;
        const response = route.type === "endpoint" ? await render_route(request, route) : await render_page(request, route, options);
        if (response) {
          if (response.status === 200) {
            if (!/(no-store|immutable)/.test(response.headers["cache-control"])) {
              const etag = `"${md5(response.body)}"`;
              if (request.headers["if-none-match"] === etag) {
                return {
                  status: 304,
                  headers: {},
                  body: null
                };
              }
              response.headers["etag"] = etag;
            }
          }
          return response;
        }
      }
      return await render_page(request, null, options);
    });
  } catch (e) {
    if (e && e.stack) {
      e.stack = await options.get_stack(e);
    }
    console.error(e && e.stack || e);
    return {
      status: 500,
      headers: {},
      body: options.dev ? e.stack : e.message
    };
  }
}
function run(fn) {
  return fn();
}
function blank_object() {
  return Object.create(null);
}
function run_all(fns) {
  fns.forEach(run);
}
let current_component;
function set_current_component(component) {
  current_component = component;
}
function get_current_component() {
  if (!current_component)
    throw new Error("Function called outside component initialization");
  return current_component;
}
function onMount(fn) {
  get_current_component().$$.on_mount.push(fn);
}
function afterUpdate(fn) {
  get_current_component().$$.after_update.push(fn);
}
function setContext(key, context) {
  get_current_component().$$.context.set(key, context);
}
const escaped = {
  '"': "&quot;",
  "'": "&#39;",
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;"
};
function escape(html) {
  return String(html).replace(/["'&<>]/g, (match) => escaped[match]);
}
const missing_component = {
  $$render: () => ""
};
function validate_component(component, name) {
  if (!component || !component.$$render) {
    if (name === "svelte:component")
      name += " this={...}";
    throw new Error(`<${name}> is not a valid SSR component. You may need to review your build config to ensure that dependencies are compiled, rather than imported as pre-compiled modules`);
  }
  return component;
}
let on_destroy;
function create_ssr_component(fn) {
  function $$render(result, props, bindings, slots) {
    const parent_component = current_component;
    const $$ = {
      on_destroy,
      context: new Map(parent_component ? parent_component.$$.context : []),
      on_mount: [],
      before_update: [],
      after_update: [],
      callbacks: blank_object()
    };
    set_current_component({$$});
    const html = fn(result, props, bindings, slots);
    set_current_component(parent_component);
    return html;
  }
  return {
    render: (props = {}, options = {}) => {
      on_destroy = [];
      const result = {title: "", head: "", css: new Set()};
      const html = $$render(result, props, {}, options);
      run_all(on_destroy);
      return {
        html,
        css: {
          code: Array.from(result.css).map((css2) => css2.code).join("\n"),
          map: null
        },
        head: result.title + result.head
      };
    },
    $$render
  };
}
function add_attribute(name, value, boolean) {
  if (value == null || boolean && !value)
    return "";
  return ` ${name}${value === true ? "" : `=${typeof value === "string" ? JSON.stringify(escape(value)) : `"${value}"`}`}`;
}
const Error$1 = create_ssr_component(($$result, $$props, $$bindings, slots) => {
  let {status} = $$props;
  let {error: error2} = $$props;
  if ($$props.status === void 0 && $$bindings.status && status !== void 0)
    $$bindings.status(status);
  if ($$props.error === void 0 && $$bindings.error && error2 !== void 0)
    $$bindings.error(error2);
  return `<h1>${escape(status)}</h1>

<p>${escape(error2.message)}</p>


${error2.stack ? `<pre>${escape(error2.stack)}</pre>` : ``}`;
});
var error = /* @__PURE__ */ Object.freeze({
  __proto__: null,
  [Symbol.toStringTag]: "Module",
  default: Error$1
});
var root_svelte = "#svelte-announcer.svelte-1j55zn5{position:absolute;left:0;top:0;clip:rect(0 0 0 0);clip-path:inset(50%);overflow:hidden;white-space:nowrap;width:1px;height:1px}";
const css$5 = {
  code: "#svelte-announcer.svelte-1j55zn5{position:absolute;left:0;top:0;clip:rect(0 0 0 0);clip-path:inset(50%);overflow:hidden;white-space:nowrap;width:1px;height:1px}",
  map: `{"version":3,"file":"root.svelte","sources":["root.svelte"],"sourcesContent":["<!-- This file is generated by @sveltejs/kit \u2014 do not edit it! -->\\n<script>\\n\\timport { setContext, afterUpdate, onMount } from 'svelte';\\n\\timport ErrorComponent from \\"../components/error.svelte\\";\\n\\n\\t// error handling\\n\\texport let status = undefined;\\n\\texport let error = undefined;\\n\\n\\t// stores\\n\\texport let stores;\\n\\texport let page;\\n\\n\\texport let components;\\n\\texport let props_0 = null;\\n\\texport let props_1 = null;\\n\\n\\tconst Layout = components[0];\\n\\n\\tsetContext('__svelte__', stores);\\n\\n\\t$: stores.page.set(page);\\n\\tafterUpdate(stores.page.notify);\\n\\n\\tlet mounted = false;\\n\\tlet navigated = false;\\n\\tlet title = null;\\n\\n\\tonMount(() => {\\n\\t\\tconst unsubscribe = stores.page.subscribe(() => {\\n\\t\\t\\tif (mounted) {\\n\\t\\t\\t\\tnavigated = true;\\n\\t\\t\\t\\ttitle = document.title;\\n\\t\\t\\t}\\n\\t\\t});\\n\\n\\t\\tmounted = true;\\n\\t\\treturn unsubscribe;\\n\\t});\\n</script>\\n\\n<Layout {...(props_0 || {})}>\\n\\t{#if error}\\n\\t\\t<ErrorComponent {status} {error}/>\\n\\t{:else}\\n\\t\\t<svelte:component this={components[1]} {...(props_1 || {})}/>\\n\\t{/if}\\n</Layout>\\n\\n{#if mounted}\\n\\t<div id=\\"svelte-announcer\\" aria-live=\\"assertive\\" aria-atomic=\\"true\\">\\n\\t\\t{#if navigated}\\n\\t\\t\\tNavigated to {title}\\n\\t\\t{/if}\\n\\t</div>\\n{/if}\\n\\n<style>\\n\\t#svelte-announcer {\\n\\t\\tposition: absolute;\\n\\t\\tleft: 0;\\n\\t\\ttop: 0;\\n\\t\\tclip: rect(0 0 0 0);\\n\\t\\tclip-path: inset(50%);\\n\\t\\toverflow: hidden;\\n\\t\\twhite-space: nowrap;\\n\\t\\twidth: 1px;\\n\\t\\theight: 1px;\\n\\t}\\n</style>"],"names":[],"mappings":"AA0DC,iBAAiB,eAAC,CAAC,AAClB,QAAQ,CAAE,QAAQ,CAClB,IAAI,CAAE,CAAC,CACP,GAAG,CAAE,CAAC,CACN,IAAI,CAAE,KAAK,CAAC,CAAC,CAAC,CAAC,CAAC,CAAC,CAAC,CAAC,CACnB,SAAS,CAAE,MAAM,GAAG,CAAC,CACrB,QAAQ,CAAE,MAAM,CAChB,WAAW,CAAE,MAAM,CACnB,KAAK,CAAE,GAAG,CACV,MAAM,CAAE,GAAG,AACZ,CAAC"}`
};
const Root = create_ssr_component(($$result, $$props, $$bindings, slots) => {
  let {status = void 0} = $$props;
  let {error: error2 = void 0} = $$props;
  let {stores} = $$props;
  let {page} = $$props;
  let {components: components2} = $$props;
  let {props_0 = null} = $$props;
  let {props_1 = null} = $$props;
  const Layout = components2[0];
  setContext("__svelte__", stores);
  afterUpdate(stores.page.notify);
  let mounted = false;
  let navigated = false;
  let title = null;
  onMount(() => {
    const unsubscribe = stores.page.subscribe(() => {
      if (mounted) {
        navigated = true;
        title = document.title;
      }
    });
    mounted = true;
    return unsubscribe;
  });
  if ($$props.status === void 0 && $$bindings.status && status !== void 0)
    $$bindings.status(status);
  if ($$props.error === void 0 && $$bindings.error && error2 !== void 0)
    $$bindings.error(error2);
  if ($$props.stores === void 0 && $$bindings.stores && stores !== void 0)
    $$bindings.stores(stores);
  if ($$props.page === void 0 && $$bindings.page && page !== void 0)
    $$bindings.page(page);
  if ($$props.components === void 0 && $$bindings.components && components2 !== void 0)
    $$bindings.components(components2);
  if ($$props.props_0 === void 0 && $$bindings.props_0 && props_0 !== void 0)
    $$bindings.props_0(props_0);
  if ($$props.props_1 === void 0 && $$bindings.props_1 && props_1 !== void 0)
    $$bindings.props_1(props_1);
  $$result.css.add(css$5);
  {
    stores.page.set(page);
  }
  return `


${validate_component(Layout, "Layout").$$render($$result, Object.assign(props_0 || {}), {}, {
    default: () => `${error2 ? `${validate_component(Error$1, "ErrorComponent").$$render($$result, {status, error: error2}, {}, {})}` : `${validate_component(components2[1] || missing_component, "svelte:component").$$render($$result, Object.assign(props_1 || {}), {}, {})}`}`
  })}

${mounted ? `<div id="${"svelte-announcer"}" aria-live="${"assertive"}" aria-atomic="${"true"}" class="${"svelte-1j55zn5"}">${navigated ? `Navigated to ${escape(title)}` : ``}</div>` : ``}`;
});
var user_hooks = /* @__PURE__ */ Object.freeze({
  __proto__: null,
  [Symbol.toStringTag]: "Module"
});
const template = ({head, body}) => `<!DOCTYPE html>
<html lang="en">

<head>
	<meta charset="utf-8" />
	<link rel="icon" href="/favicon.ico" />
	<link rel="preconnect" href="https://fonts.gstatic.com">
	<link href="https://fonts.googleapis.com/css2?family=Open+Sans&display=swap" rel="stylesheet">
	<meta name="viewport" content="width=device-width, initial-scale=1" />

	<!-- Global site tag (gtag.js) - Google Analytics -->
	<script async src="https://www.googletagmanager.com/gtag/js?id=G-XR78KY8ZFJ"></script>
	<script>
		window.dataLayer = window.dataLayer || [];

		function gtag() {
			dataLayer.push(arguments);
		}
		gtag('js', new Date());

		gtag('config', 'G-XR78KY8ZFJ');
	</script>


	` + head + '\n</head>\n\n<body>\n	<div id="svelte">' + body + "</div>\n</body>\n\n</html>\n\n<style>\n	h1,\n	h2,\n	h3,\n	h4,\n	h5,\n	p,\n	a,\n	li,\n	ul,\n	button,\n	input {\n		font-family: 'Open Sans', sans-serif;\n\n		color: white;\n		margin: 0;\n		inline-size: fit-content;\n	}\n</style>";
function init({paths}) {
}
const empty = () => ({});
const components = [
  () => Promise.resolve().then(function() {
    return index;
  }),
  () => Promise.resolve().then(function() {
    return clubs;
  })
];
const client_component_lookup = {".svelte/build/runtime/internal/start.js": "start-0f194247.js", "src/routes/index.svelte": "pages/index.svelte-ddf4b128.js", "src/routes/clubs.svelte": "pages/clubs.svelte-101b0049.js"};
const manifest = {
  assets: [{file: "favicon.ico", size: 1150, type: "image/vnd.microsoft.icon"}, {file: "robots.txt", size: 67, type: "text/plain"}],
  layout: () => Promise.resolve().then(function() {
    return $layout$1;
  }),
  error: () => Promise.resolve().then(function() {
    return error;
  }),
  routes: [
    {
      type: "page",
      pattern: /^\/$/,
      params: empty,
      parts: [{id: "src/routes/index.svelte", load: components[0]}],
      css: ["assets/start-1b5e1f57.css", "assets/pages/index.svelte-a00e5b17.css"],
      js: ["start-0f194247.js", "chunks/vendor-c56092ef.js", "pages/index.svelte-ddf4b128.js"]
    },
    {
      type: "page",
      pattern: /^\/clubs\/?$/,
      params: empty,
      parts: [{id: "src/routes/clubs.svelte", load: components[1]}],
      css: ["assets/start-1b5e1f57.css", "assets/pages/clubs.svelte-263351e5.css"],
      js: ["start-0f194247.js", "chunks/vendor-c56092ef.js", "pages/clubs.svelte-101b0049.js"]
    }
  ]
};
const get_hooks = (hooks2) => ({
  getContext: hooks2.getContext || (() => ({})),
  getSession: hooks2.getSession || (() => ({})),
  handle: hooks2.handle || ((request, render2) => render2(request))
});
const hooks = get_hooks(user_hooks);
function render(request, {
  paths = {base: "", assets: "/."},
  local = false,
  only_render_prerenderable_pages = false,
  get_static_file
} = {}) {
  return ssr({
    ...request,
    host: request.headers["host"]
  }, {
    paths,
    local,
    template,
    manifest,
    target: "#svelte",
    entry: "/./_app/start-0f194247.js",
    root: Root,
    hooks,
    dev: false,
    amp: false,
    only_render_prerenderable_pages,
    app_dir: "_app",
    get_component_path: (id) => "/./_app/" + client_component_lookup[id],
    get_stack: (error2) => error2.stack,
    get_static_file,
    get_amp_css: (dep) => amp_css_lookup[dep]
  });
}
var index_svelte = "nav{display:none}body{margin:0;height:100vh;background:linear-gradient(235.71deg, #400a84 7.8%, #1b0a30 92.44%)}main.svelte-qgj3c0.svelte-qgj3c0{padding:1em;width:480px;margin:auto;position:absolute;top:calc(50% - 200px);left:calc(50% - 240px)}main.svelte-qgj3c0 h3.svelte-qgj3c0{margin-top:16px;margin-bottom:8px}.email-form.svelte-qgj3c0.svelte-qgj3c0{width:480px;margin:32px auto;display:flex;flex-direction:column;align-items:flex-start;padding:24px;background:linear-gradient(0deg, #040a11, #040a11), #0352af;box-shadow:0px 4px 4px rgba(0, 0, 0, 0.25);border-radius:8px}.email-form.svelte-qgj3c0 .form-input.svelte-qgj3c0{width:100%;display:flex}.email-form.svelte-qgj3c0 .form-input input.svelte-qgj3c0{flex:1;height:48px;border:none;background:rgba(142, 145, 148, 0.1);border-radius:4px;color:white;margin-right:16px;padding:0 16px}.email-form.svelte-qgj3c0 .form-input button.svelte-qgj3c0{height:48px;width:80px;border:none;background:#400a84;border-radius:4px;padding:8px;color:white;font-weight:600;font-size:14px}.email-form.svelte-qgj3c0 h5.svelte-qgj3c0{margin:0}.email-form.svelte-qgj3c0 p.svelte-qgj3c0{font-size:12px;font-weight:300;text-align:start;margin-top:8px;color:#aaa}";
const css$4 = {
  code: "nav{display:none}body{margin:0;height:100vh;background:linear-gradient(235.71deg, #400a84 7.8%, #1b0a30 92.44%)}main.svelte-qgj3c0.svelte-qgj3c0{padding:1em;width:480px;margin:auto;position:absolute;top:calc(50% - 200px);left:calc(50% - 240px)}main.svelte-qgj3c0 h3.svelte-qgj3c0{margin-top:16px;margin-bottom:8px}.email-form.svelte-qgj3c0.svelte-qgj3c0{width:480px;margin:32px auto;display:flex;flex-direction:column;align-items:flex-start;padding:24px;background:linear-gradient(0deg, #040a11, #040a11), #0352af;box-shadow:0px 4px 4px rgba(0, 0, 0, 0.25);border-radius:8px}.email-form.svelte-qgj3c0 .form-input.svelte-qgj3c0{width:100%;display:flex}.email-form.svelte-qgj3c0 .form-input input.svelte-qgj3c0{flex:1;height:48px;border:none;background:rgba(142, 145, 148, 0.1);border-radius:4px;color:white;margin-right:16px;padding:0 16px}.email-form.svelte-qgj3c0 .form-input button.svelte-qgj3c0{height:48px;width:80px;border:none;background:#400a84;border-radius:4px;padding:8px;color:white;font-weight:600;font-size:14px}.email-form.svelte-qgj3c0 h5.svelte-qgj3c0{margin:0}.email-form.svelte-qgj3c0 p.svelte-qgj3c0{font-size:12px;font-weight:300;text-align:start;margin-top:8px;color:#aaa}",
  map: `{"version":3,"file":"index.svelte","sources":["index.svelte"],"sourcesContent":["<script lang=\\"ts\\">// import Api from \\"$lib/api/beta\\"\\n// import axios from \\"axios\\"\\nvar __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {\\n    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }\\n    return new (P || (P = Promise))(function (resolve, reject) {\\n        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }\\n        function rejected(value) { try { step(generator[\\"throw\\"](value)); } catch (e) { reject(e); } }\\n        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }\\n        step((generator = generator.apply(thisArg, _arguments || [])).next());\\n    });\\n};\\nlet email;\\nfunction signUp() {\\n    return __awaiter(this, void 0, void 0, function* () {\\n        yield fetch(\\"http://3.143.138.224:8000/join-beta\\", {\\n            method: \\"post\\",\\n            headers: {\\n                \\"Content-Type\\": \\"application/json\\",\\n            },\\n            body: JSON.stringify({\\n                email: email,\\n                createdAt: new Date(),\\n            }),\\n        });\\n        alert(\\"Thank you for registering!\\");\\n    });\\n}\\n</script>\\n\\n<svelte:head>\\n    <title>Block Parties</title>\\n    <meta name=\\"og:title\\" content=\\"Block Parties\\" />\\n    <meta name=\\"og:description\\" content=\\"Invest with others safely and securely, powered by blockchain technology.\\" />\\n</svelte:head>\\n\\n<main>\\n    <h1>Block Parties</h1>\\n\\n    <div>\\n        <h3>An <b>Evolution</b> in Investing... coming soon</h3>\\n        <p>\\n            Leveraging the blockchain to make group investing as <b>secure</b>, <b>easy</b>, and <b>social</b> as ever.\\n        </p>\\n    </div>\\n\\n    <div class=\\"email-form\\">\\n        <h5>Reserve your seat in the limited access beta</h5>\\n        <br /><br />\\n        <div class=\\"form-input\\">\\n            <input bind:value={email} type=\\"email\\" placeholder=\\"Enter your email\\" />\\n            <button on:click={signUp}>Submit</button>\\n        </div>\\n        <p>We won't use your email for anything other than letting you know when beta opens.</p>\\n        <br />\\n        <p>Wanna chat? <a href=\\"https://discord.gg/TNGQuuazez\\"> Join our Discord</a></p>\\n    </div>\\n</main>\\n\\n<style lang=\\"scss\\">:global(nav) {\\n  display: none;\\n}\\n\\n:global(body) {\\n  margin: 0;\\n  height: 100vh;\\n  background: linear-gradient(235.71deg, #400a84 7.8%, #1b0a30 92.44%);\\n}\\n\\nmain {\\n  padding: 1em;\\n  width: 480px;\\n  margin: auto;\\n  position: absolute;\\n  top: calc(50% - 200px);\\n  left: calc(50% - 240px);\\n}\\nmain h3 {\\n  margin-top: 16px;\\n  margin-bottom: 8px;\\n}\\n\\n.email-form {\\n  width: 480px;\\n  margin: 32px auto;\\n  display: flex;\\n  flex-direction: column;\\n  align-items: flex-start;\\n  padding: 24px;\\n  background: linear-gradient(0deg, #040a11, #040a11), #0352af;\\n  box-shadow: 0px 4px 4px rgba(0, 0, 0, 0.25);\\n  border-radius: 8px;\\n}\\n.email-form .form-input {\\n  width: 100%;\\n  display: flex;\\n}\\n.email-form .form-input input {\\n  flex: 1;\\n  height: 48px;\\n  border: none;\\n  background: rgba(142, 145, 148, 0.1);\\n  border-radius: 4px;\\n  color: white;\\n  margin-right: 16px;\\n  padding: 0 16px;\\n}\\n.email-form .form-input button {\\n  height: 48px;\\n  width: 80px;\\n  border: none;\\n  background: #400a84;\\n  border-radius: 4px;\\n  padding: 8px;\\n  color: white;\\n  font-weight: 600;\\n  font-size: 14px;\\n}\\n.email-form h5 {\\n  margin: 0;\\n}\\n.email-form p {\\n  font-size: 12px;\\n  font-weight: 300;\\n  text-align: start;\\n  margin-top: 8px;\\n  color: #aaa;\\n}</style>\\n"],"names":[],"mappings":"AA0D2B,GAAG,AAAE,CAAC,AAC/B,OAAO,CAAE,IAAI,AACf,CAAC,AAEO,IAAI,AAAE,CAAC,AACb,MAAM,CAAE,CAAC,CACT,MAAM,CAAE,KAAK,CACb,UAAU,CAAE,gBAAgB,SAAS,CAAC,CAAC,OAAO,CAAC,IAAI,CAAC,CAAC,OAAO,CAAC,MAAM,CAAC,AACtE,CAAC,AAED,IAAI,4BAAC,CAAC,AACJ,OAAO,CAAE,GAAG,CACZ,KAAK,CAAE,KAAK,CACZ,MAAM,CAAE,IAAI,CACZ,QAAQ,CAAE,QAAQ,CAClB,GAAG,CAAE,KAAK,GAAG,CAAC,CAAC,CAAC,KAAK,CAAC,CACtB,IAAI,CAAE,KAAK,GAAG,CAAC,CAAC,CAAC,KAAK,CAAC,AACzB,CAAC,AACD,kBAAI,CAAC,EAAE,cAAC,CAAC,AACP,UAAU,CAAE,IAAI,CAChB,aAAa,CAAE,GAAG,AACpB,CAAC,AAED,WAAW,4BAAC,CAAC,AACX,KAAK,CAAE,KAAK,CACZ,MAAM,CAAE,IAAI,CAAC,IAAI,CACjB,OAAO,CAAE,IAAI,CACb,cAAc,CAAE,MAAM,CACtB,WAAW,CAAE,UAAU,CACvB,OAAO,CAAE,IAAI,CACb,UAAU,CAAE,gBAAgB,IAAI,CAAC,CAAC,OAAO,CAAC,CAAC,OAAO,CAAC,CAAC,CAAC,OAAO,CAC5D,UAAU,CAAE,GAAG,CAAC,GAAG,CAAC,GAAG,CAAC,KAAK,CAAC,CAAC,CAAC,CAAC,CAAC,CAAC,CAAC,CAAC,CAAC,IAAI,CAAC,CAC3C,aAAa,CAAE,GAAG,AACpB,CAAC,AACD,yBAAW,CAAC,WAAW,cAAC,CAAC,AACvB,KAAK,CAAE,IAAI,CACX,OAAO,CAAE,IAAI,AACf,CAAC,AACD,yBAAW,CAAC,WAAW,CAAC,KAAK,cAAC,CAAC,AAC7B,IAAI,CAAE,CAAC,CACP,MAAM,CAAE,IAAI,CACZ,MAAM,CAAE,IAAI,CACZ,UAAU,CAAE,KAAK,GAAG,CAAC,CAAC,GAAG,CAAC,CAAC,GAAG,CAAC,CAAC,GAAG,CAAC,CACpC,aAAa,CAAE,GAAG,CAClB,KAAK,CAAE,KAAK,CACZ,YAAY,CAAE,IAAI,CAClB,OAAO,CAAE,CAAC,CAAC,IAAI,AACjB,CAAC,AACD,yBAAW,CAAC,WAAW,CAAC,MAAM,cAAC,CAAC,AAC9B,MAAM,CAAE,IAAI,CACZ,KAAK,CAAE,IAAI,CACX,MAAM,CAAE,IAAI,CACZ,UAAU,CAAE,OAAO,CACnB,aAAa,CAAE,GAAG,CAClB,OAAO,CAAE,GAAG,CACZ,KAAK,CAAE,KAAK,CACZ,WAAW,CAAE,GAAG,CAChB,SAAS,CAAE,IAAI,AACjB,CAAC,AACD,yBAAW,CAAC,EAAE,cAAC,CAAC,AACd,MAAM,CAAE,CAAC,AACX,CAAC,AACD,yBAAW,CAAC,CAAC,cAAC,CAAC,AACb,SAAS,CAAE,IAAI,CACf,WAAW,CAAE,GAAG,CAChB,UAAU,CAAE,KAAK,CACjB,UAAU,CAAE,GAAG,CACf,KAAK,CAAE,IAAI,AACb,CAAC"}`
};
const Routes = create_ssr_component(($$result, $$props, $$bindings, slots) => {
  (function(thisArg, _arguments, P, generator) {
    function adopt(value) {
      return value instanceof P ? value : new P(function(resolve2) {
        resolve2(value);
      });
    }
    return new (P || (P = Promise))(function(resolve2, reject) {
      function fulfilled(value) {
        try {
          step(generator.next(value));
        } catch (e) {
          reject(e);
        }
      }
      function rejected(value) {
        try {
          step(generator["throw"](value));
        } catch (e) {
          reject(e);
        }
      }
      function step(result) {
        result.done ? resolve2(result.value) : adopt(result.value).then(fulfilled, rejected);
      }
      step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
  });
  let email;
  $$result.css.add(css$4);
  return `${$$result.head += `${$$result.title = `<title>Block Parties</title>`, ""}<meta name="${"og:title"}" content="${"Block Parties"}" data-svelte="svelte-wfknh5"><meta name="${"og:description"}" content="${"Invest with others safely and securely, powered by blockchain technology."}" data-svelte="svelte-wfknh5">`, ""}

<main class="${"svelte-qgj3c0"}"><h1>Block Parties</h1>

    <div><h3 class="${"svelte-qgj3c0"}">An <b>Evolution</b> in Investing... coming soon</h3>
        <p>Leveraging the blockchain to make group investing as <b>secure</b>, <b>easy</b>, and <b>social</b> as ever.
        </p></div>

    <div class="${"email-form svelte-qgj3c0"}"><h5 class="${"svelte-qgj3c0"}">Reserve your seat in the limited access beta</h5>
        <br><br>
        <div class="${"form-input svelte-qgj3c0"}"><input type="${"email"}" placeholder="${"Enter your email"}" class="${"svelte-qgj3c0"}"${add_attribute("value", email, 1)}>
            <button class="${"svelte-qgj3c0"}">Submit</button></div>
        <p class="${"svelte-qgj3c0"}">We won&#39;t use your email for anything other than letting you know when beta opens.</p>
        <br>
        <p class="${"svelte-qgj3c0"}">Wanna chat? <a href="${"https://discord.gg/TNGQuuazez"}">Join our Discord</a></p></div>
</main>`;
});
var index = /* @__PURE__ */ Object.freeze({
  __proto__: null,
  [Symbol.toStringTag]: "Module",
  default: Routes
});
var ModalPopup_svelte = "div.svelte-qox25m{z-index:100;position:fixed;top:0;left:0;right:0;bottom:0;background:#000000aa}";
var Tag_svelte = ".outer.svelte-1tw10bd.svelte-1tw10bd{border-radius:16px;inline-size:fit-content}.outer.svelte-1tw10bd p.svelte-1tw10bd{margin:0;padding:4px 16px;display:inline-block;font-weight:600;font-size:12px}";
const css$3 = {
  code: ".outer.svelte-1tw10bd.svelte-1tw10bd{border-radius:16px;inline-size:fit-content}.outer.svelte-1tw10bd p.svelte-1tw10bd{margin:0;padding:4px 16px;display:inline-block;font-weight:600;font-size:12px}",
  map: '{"version":3,"file":"Tag.svelte","sources":["Tag.svelte"],"sourcesContent":["<script lang=\\"ts\\">import { onMount } from \\"svelte\\";\\nexport let text;\\nexport let color;\\nlet tag;\\nonMount(() => {\\n    console.log(tag);\\n    tag.style.background = color;\\n});\\n</script>\\n\\n<div bind:this={tag} class=\\"outer\\">\\n    <p>{text}</p>\\n</div>\\n\\n<style lang=\\"scss\\">.outer {\\n  border-radius: 16px;\\n  inline-size: fit-content;\\n}\\n.outer p {\\n  margin: 0;\\n  padding: 4px 16px;\\n  display: inline-block;\\n  font-weight: 600;\\n  font-size: 12px;\\n}</style>\\n"],"names":[],"mappings":"AAcmB,MAAM,8BAAC,CAAC,AACzB,aAAa,CAAE,IAAI,CACnB,WAAW,CAAE,WAAW,AAC1B,CAAC,AACD,qBAAM,CAAC,CAAC,eAAC,CAAC,AACR,MAAM,CAAE,CAAC,CACT,OAAO,CAAE,GAAG,CAAC,IAAI,CACjB,OAAO,CAAE,YAAY,CACrB,WAAW,CAAE,GAAG,CAChB,SAAS,CAAE,IAAI,AACjB,CAAC"}'
};
const Tag = create_ssr_component(($$result, $$props, $$bindings, slots) => {
  let {text} = $$props;
  let {color} = $$props;
  let tag;
  onMount(() => {
    console.log(tag);
    tag.style.background = color;
  });
  if ($$props.text === void 0 && $$bindings.text && text !== void 0)
    $$bindings.text(text);
  if ($$props.color === void 0 && $$bindings.color && color !== void 0)
    $$bindings.color(color);
  $$result.css.add(css$3);
  return `<div class="${"outer svelte-1tw10bd"}"${add_attribute("this", tag, 1)}><p class="${"svelte-1tw10bd"}">${escape(text)}</p>
</div>`;
});
var ClubCard_svelte = ".outer.svelte-1t5b33p.svelte-1t5b33p{transition:all 0.25s;cursor:pointer;position:relative;background:blue;width:400px;height:400px;border-radius:4px;background:#023b70;box-shadow:0 0 1px 2px #00000066}.outer.svelte-1t5b33p.svelte-1t5b33p:hover{box-shadow:0 2px 2px 4px #00000066;background:#023b70dd}.chart.svelte-1t5b33p.svelte-1t5b33p{height:40%;background:green;border-radius:4px 4px 0 0}.bottom-half.svelte-1t5b33p.svelte-1t5b33p{padding:16px}.bottom-half.svelte-1t5b33p .title-row.svelte-1t5b33p{display:flex;justify-content:space-between}.bottom-half.svelte-1t5b33p .title-row h4.svelte-1t5b33p{color:white}.bottom-half.svelte-1t5b33p .description.svelte-1t5b33p{font-size:14px;font-weight:300;margin:16px 0}.bottom-half.svelte-1t5b33p .tags.svelte-1t5b33p{display:flex}.bottom-half.svelte-1t5b33p .tags div.svelte-1t5b33p{margin-right:8px}.bottom-half.svelte-1t5b33p .tags.svelte-1t5b33p{position:absolute;bottom:76px}.bottom-half.svelte-1t5b33p .footer.svelte-1t5b33p{position:absolute;bottom:0;left:0;right:0;height:40px;border-radius:0 0 4px 4px;display:flex;justify-content:space-between;align-items:center;padding:8px 16px;background:rgba(0, 0, 0, 0.25)}.bottom-half.svelte-1t5b33p .footer p.svelte-1t5b33p{font-weight:600}";
const css$2 = {
  code: ".outer.svelte-1t5b33p.svelte-1t5b33p{transition:all 0.25s;cursor:pointer;position:relative;background:blue;width:400px;height:400px;border-radius:4px;background:#023b70;box-shadow:0 0 1px 2px #00000066}.outer.svelte-1t5b33p.svelte-1t5b33p:hover{box-shadow:0 2px 2px 4px #00000066;background:#023b70dd}.chart.svelte-1t5b33p.svelte-1t5b33p{height:40%;background:green;border-radius:4px 4px 0 0}.bottom-half.svelte-1t5b33p.svelte-1t5b33p{padding:16px}.bottom-half.svelte-1t5b33p .title-row.svelte-1t5b33p{display:flex;justify-content:space-between}.bottom-half.svelte-1t5b33p .title-row h4.svelte-1t5b33p{color:white}.bottom-half.svelte-1t5b33p .description.svelte-1t5b33p{font-size:14px;font-weight:300;margin:16px 0}.bottom-half.svelte-1t5b33p .tags.svelte-1t5b33p{display:flex}.bottom-half.svelte-1t5b33p .tags div.svelte-1t5b33p{margin-right:8px}.bottom-half.svelte-1t5b33p .tags.svelte-1t5b33p{position:absolute;bottom:76px}.bottom-half.svelte-1t5b33p .footer.svelte-1t5b33p{position:absolute;bottom:0;left:0;right:0;height:40px;border-radius:0 0 4px 4px;display:flex;justify-content:space-between;align-items:center;padding:8px 16px;background:rgba(0, 0, 0, 0.25)}.bottom-half.svelte-1t5b33p .footer p.svelte-1t5b33p{font-weight:600}",
  map: '{"version":3,"file":"ClubCard.svelte","sources":["ClubCard.svelte"],"sourcesContent":["<script>\\n    import ModalPopup from \\"./ModalPopup.svelte\\"\\n    import Tag from \\"./Tag.svelte\\"\\n\\n    let showPopup = false\\n</script>\\n\\n<div class=\\"outer\\" on:click={() => (showPopup = true)}>\\n    <div class=\\"chart\\">CHART GOES HERE</div>\\n\\n    <div class=\\"bottom-half\\">\\n        <div class=\\"title-row\\">\\n            <h4>Tech Dudez</h4>\\n            <Tag text=\\"HIGH\\" color={\\"red\\"} />\\n        </div>\\n\\n        <p class=\\"description\\">This is a short description of the club. It should be about a line.</p>\\n\\n        <div class=\\"tags\\">\\n            <div>\\n                <Tag text=\\"Tech\\" color=\\"green\\" />\\n            </div>\\n            <div>\\n                <Tag text=\\"Oil\\" color=\\"orange\\" />\\n            </div>\\n            <div>\\n                <Tag text=\\"Energy\\" color=\\"purple\\" />\\n            </div>\\n        </div>\\n\\n        <div class=\\"footer\\">\\n            <div>O O O O</div>\\n            <p>$15k - $50k invested</p>\\n        </div>\\n    </div>\\n</div>\\n\\n{#if showPopup}\\n    <ModalPopup dismiss={() => (showPopup = false)} />\\n{/if}\\n\\n<style lang=\\"scss\\">.outer {\\n  transition: all 0.25s;\\n  cursor: pointer;\\n  position: relative;\\n  background: blue;\\n  width: 400px;\\n  height: 400px;\\n  border-radius: 4px;\\n  background: #023b70;\\n  box-shadow: 0 0 1px 2px #00000066;\\n}\\n.outer:hover {\\n  box-shadow: 0 2px 2px 4px #00000066;\\n  background: #023b70dd;\\n}\\n\\n.chart {\\n  height: 40%;\\n  background: green;\\n  border-radius: 4px 4px 0 0;\\n}\\n\\n.bottom-half {\\n  padding: 16px;\\n}\\n.bottom-half .title-row {\\n  display: flex;\\n  justify-content: space-between;\\n}\\n.bottom-half .title-row h4 {\\n  color: white;\\n}\\n.bottom-half .description {\\n  font-size: 14px;\\n  font-weight: 300;\\n  margin: 16px 0;\\n}\\n.bottom-half .tags {\\n  display: flex;\\n}\\n.bottom-half .tags div {\\n  margin-right: 8px;\\n}\\n.bottom-half .tags {\\n  position: absolute;\\n  bottom: 76px;\\n}\\n.bottom-half .footer {\\n  position: absolute;\\n  bottom: 0;\\n  left: 0;\\n  right: 0;\\n  height: 40px;\\n  border-radius: 0 0 4px 4px;\\n  display: flex;\\n  justify-content: space-between;\\n  align-items: center;\\n  padding: 8px 16px;\\n  background: rgba(0, 0, 0, 0.25);\\n}\\n.bottom-half .footer p {\\n  font-weight: 600;\\n}</style>\\n"],"names":[],"mappings":"AAyCmB,MAAM,8BAAC,CAAC,AACzB,UAAU,CAAE,GAAG,CAAC,KAAK,CACrB,MAAM,CAAE,OAAO,CACf,QAAQ,CAAE,QAAQ,CAClB,UAAU,CAAE,IAAI,CAChB,KAAK,CAAE,KAAK,CACZ,MAAM,CAAE,KAAK,CACb,aAAa,CAAE,GAAG,CAClB,UAAU,CAAE,OAAO,CACnB,UAAU,CAAE,CAAC,CAAC,CAAC,CAAC,GAAG,CAAC,GAAG,CAAC,SAAS,AACnC,CAAC,AACD,oCAAM,MAAM,AAAC,CAAC,AACZ,UAAU,CAAE,CAAC,CAAC,GAAG,CAAC,GAAG,CAAC,GAAG,CAAC,SAAS,CACnC,UAAU,CAAE,SAAS,AACvB,CAAC,AAED,MAAM,8BAAC,CAAC,AACN,MAAM,CAAE,GAAG,CACX,UAAU,CAAE,KAAK,CACjB,aAAa,CAAE,GAAG,CAAC,GAAG,CAAC,CAAC,CAAC,CAAC,AAC5B,CAAC,AAED,YAAY,8BAAC,CAAC,AACZ,OAAO,CAAE,IAAI,AACf,CAAC,AACD,2BAAY,CAAC,UAAU,eAAC,CAAC,AACvB,OAAO,CAAE,IAAI,CACb,eAAe,CAAE,aAAa,AAChC,CAAC,AACD,2BAAY,CAAC,UAAU,CAAC,EAAE,eAAC,CAAC,AAC1B,KAAK,CAAE,KAAK,AACd,CAAC,AACD,2BAAY,CAAC,YAAY,eAAC,CAAC,AACzB,SAAS,CAAE,IAAI,CACf,WAAW,CAAE,GAAG,CAChB,MAAM,CAAE,IAAI,CAAC,CAAC,AAChB,CAAC,AACD,2BAAY,CAAC,KAAK,eAAC,CAAC,AAClB,OAAO,CAAE,IAAI,AACf,CAAC,AACD,2BAAY,CAAC,KAAK,CAAC,GAAG,eAAC,CAAC,AACtB,YAAY,CAAE,GAAG,AACnB,CAAC,AACD,2BAAY,CAAC,KAAK,eAAC,CAAC,AAClB,QAAQ,CAAE,QAAQ,CAClB,MAAM,CAAE,IAAI,AACd,CAAC,AACD,2BAAY,CAAC,OAAO,eAAC,CAAC,AACpB,QAAQ,CAAE,QAAQ,CAClB,MAAM,CAAE,CAAC,CACT,IAAI,CAAE,CAAC,CACP,KAAK,CAAE,CAAC,CACR,MAAM,CAAE,IAAI,CACZ,aAAa,CAAE,CAAC,CAAC,CAAC,CAAC,GAAG,CAAC,GAAG,CAC1B,OAAO,CAAE,IAAI,CACb,eAAe,CAAE,aAAa,CAC9B,WAAW,CAAE,MAAM,CACnB,OAAO,CAAE,GAAG,CAAC,IAAI,CACjB,UAAU,CAAE,KAAK,CAAC,CAAC,CAAC,CAAC,CAAC,CAAC,CAAC,CAAC,CAAC,IAAI,CAAC,AACjC,CAAC,AACD,2BAAY,CAAC,OAAO,CAAC,CAAC,eAAC,CAAC,AACtB,WAAW,CAAE,GAAG,AAClB,CAAC"}'
};
const ClubCard = create_ssr_component(($$result, $$props, $$bindings, slots) => {
  $$result.css.add(css$2);
  return `<div class="${"outer svelte-1t5b33p"}"><div class="${"chart svelte-1t5b33p"}">CHART GOES HERE</div>

    <div class="${"bottom-half svelte-1t5b33p"}"><div class="${"title-row svelte-1t5b33p"}"><h4 class="${"svelte-1t5b33p"}">Tech Dudez</h4>
            ${validate_component(Tag, "Tag").$$render($$result, {text: "HIGH", color: "red"}, {}, {})}</div>

        <p class="${"description svelte-1t5b33p"}">This is a short description of the club. It should be about a line.</p>

        <div class="${"tags svelte-1t5b33p"}"><div class="${"svelte-1t5b33p"}">${validate_component(Tag, "Tag").$$render($$result, {text: "Tech", color: "green"}, {}, {})}</div>
            <div class="${"svelte-1t5b33p"}">${validate_component(Tag, "Tag").$$render($$result, {text: "Oil", color: "orange"}, {}, {})}</div>
            <div class="${"svelte-1t5b33p"}">${validate_component(Tag, "Tag").$$render($$result, {text: "Energy", color: "purple"}, {}, {})}</div></div>

        <div class="${"footer svelte-1t5b33p"}"><div class="${"svelte-1t5b33p"}">O O O O</div>
            <p class="${"svelte-1t5b33p"}">$15k - $50k invested</p></div></div></div>

${``}`;
});
var clubs_svelte = "body{margin:0;background:#0c0218}.outer.svelte-1iwtxv7.svelte-1iwtxv7{display:flex}.sidebar.svelte-1iwtxv7.svelte-1iwtxv7{position:sticky;align-self:flex-start;z-index:99;top:56px;height:calc(100vh - 2 * 60px);left:0;bottom:0;min-width:280px;background:#1b0a30;padding:32px 16px}.sidebar.svelte-1iwtxv7 h1.svelte-1iwtxv7{margin-bottom:16px}.sidebar.svelte-1iwtxv7 p.svelte-1iwtxv7{font-weight:400;font-size:14px;line-height:19px;color:#eeeeee}main.svelte-1iwtxv7.svelte-1iwtxv7{display:flex;flex-flow:row wrap;justify-content:space-around;padding:32px}main.svelte-1iwtxv7 div.svelte-1iwtxv7{padding:24px 16px}";
const css$1 = {
  code: "body{margin:0;background:#0c0218}.outer.svelte-1iwtxv7.svelte-1iwtxv7{display:flex}.sidebar.svelte-1iwtxv7.svelte-1iwtxv7{position:sticky;align-self:flex-start;z-index:99;top:56px;height:calc(100vh - 2 * 60px);left:0;bottom:0;min-width:280px;background:#1b0a30;padding:32px 16px}.sidebar.svelte-1iwtxv7 h1.svelte-1iwtxv7{margin-bottom:16px}.sidebar.svelte-1iwtxv7 p.svelte-1iwtxv7{font-weight:400;font-size:14px;line-height:19px;color:#eeeeee}main.svelte-1iwtxv7.svelte-1iwtxv7{display:flex;flex-flow:row wrap;justify-content:space-around;padding:32px}main.svelte-1iwtxv7 div.svelte-1iwtxv7{padding:24px 16px}",
  map: `{"version":3,"file":"clubs.svelte","sources":["clubs.svelte"],"sourcesContent":["<script>\\n    import ClubCard from \\"$lib/components/ClubCard.svelte\\"\\n</script>\\n\\n<svelte:head>\\n    <title>Block Parties | Directory</title>\\n    <meta name=\\"og:title\\" content=\\"Block Parties | Directory\\" />\\n    <meta name=\\"og:description\\" content=\\"Find a party to invest in digital assets with.\\" />\\n</svelte:head>\\n\\n<div class=\\"outer\\">\\n    <div class=\\"sidebar\\">\\n        <h1>Party Directory</h1>\\n\\n        <p>Investing is done best when effort, knowledge, and resources are effectively pooled together.</p>\\n        <br />\\n        <p>\\n            To get started, look for clubs with similar interests as you and a risk tolerance you're comfortable with.\\n        </p>\\n    </div>\\n\\n    <main>\\n        <div>\\n            <ClubCard />\\n        </div>\\n        <div>\\n            <ClubCard />\\n        </div>\\n        <div>\\n            <ClubCard />\\n        </div>\\n        <div>\\n            <ClubCard />\\n        </div>\\n        <div>\\n            <ClubCard />\\n        </div>\\n        <div>\\n            <ClubCard />\\n        </div>\\n    </main>\\n</div>\\n\\n<style lang=\\"scss\\">:global(body) {\\n  margin: 0;\\n  background: #0c0218;\\n}\\n\\n.outer {\\n  display: flex;\\n}\\n\\n.sidebar {\\n  position: sticky;\\n  align-self: flex-start;\\n  z-index: 99;\\n  top: 56px;\\n  height: calc(100vh - 2 * 60px);\\n  left: 0;\\n  bottom: 0;\\n  min-width: 280px;\\n  background: #1b0a30;\\n  padding: 32px 16px;\\n}\\n.sidebar h1 {\\n  margin-bottom: 16px;\\n}\\n.sidebar p {\\n  font-weight: 400;\\n  font-size: 14px;\\n  line-height: 19px;\\n  color: #eeeeee;\\n}\\n\\nmain {\\n  display: flex;\\n  flex-flow: row wrap;\\n  justify-content: space-around;\\n  padding: 32px;\\n}\\nmain div {\\n  padding: 24px 16px;\\n}</style>\\n"],"names":[],"mappings":"AA2C2B,IAAI,AAAE,CAAC,AAChC,MAAM,CAAE,CAAC,CACT,UAAU,CAAE,OAAO,AACrB,CAAC,AAED,MAAM,8BAAC,CAAC,AACN,OAAO,CAAE,IAAI,AACf,CAAC,AAED,QAAQ,8BAAC,CAAC,AACR,QAAQ,CAAE,MAAM,CAChB,UAAU,CAAE,UAAU,CACtB,OAAO,CAAE,EAAE,CACX,GAAG,CAAE,IAAI,CACT,MAAM,CAAE,KAAK,KAAK,CAAC,CAAC,CAAC,CAAC,CAAC,CAAC,CAAC,IAAI,CAAC,CAC9B,IAAI,CAAE,CAAC,CACP,MAAM,CAAE,CAAC,CACT,SAAS,CAAE,KAAK,CAChB,UAAU,CAAE,OAAO,CACnB,OAAO,CAAE,IAAI,CAAC,IAAI,AACpB,CAAC,AACD,uBAAQ,CAAC,EAAE,eAAC,CAAC,AACX,aAAa,CAAE,IAAI,AACrB,CAAC,AACD,uBAAQ,CAAC,CAAC,eAAC,CAAC,AACV,WAAW,CAAE,GAAG,CAChB,SAAS,CAAE,IAAI,CACf,WAAW,CAAE,IAAI,CACjB,KAAK,CAAE,OAAO,AAChB,CAAC,AAED,IAAI,8BAAC,CAAC,AACJ,OAAO,CAAE,IAAI,CACb,SAAS,CAAE,GAAG,CAAC,IAAI,CACnB,eAAe,CAAE,YAAY,CAC7B,OAAO,CAAE,IAAI,AACf,CAAC,AACD,mBAAI,CAAC,GAAG,eAAC,CAAC,AACR,OAAO,CAAE,IAAI,CAAC,IAAI,AACpB,CAAC"}`
};
const Clubs = create_ssr_component(($$result, $$props, $$bindings, slots) => {
  $$result.css.add(css$1);
  return `${$$result.head += `${$$result.title = `<title>Block Parties | Directory</title>`, ""}<meta name="${"og:title"}" content="${"Block Parties | Directory"}" data-svelte="svelte-1f1gt9p"><meta name="${"og:description"}" content="${"Find a party to invest in digital assets with."}" data-svelte="svelte-1f1gt9p">`, ""}

<div class="${"outer svelte-1iwtxv7"}"><div class="${"sidebar svelte-1iwtxv7"}"><h1 class="${"svelte-1iwtxv7"}">Party Directory</h1>

        <p class="${"svelte-1iwtxv7"}">Investing is done best when effort, knowledge, and resources are effectively pooled together.</p>
        <br>
        <p class="${"svelte-1iwtxv7"}">To get started, look for clubs with similar interests as you and a risk tolerance you&#39;re comfortable with.
        </p></div>

    <main class="${"svelte-1iwtxv7"}"><div class="${"svelte-1iwtxv7"}">${validate_component(ClubCard, "ClubCard").$$render($$result, {}, {}, {})}</div>
        <div class="${"svelte-1iwtxv7"}">${validate_component(ClubCard, "ClubCard").$$render($$result, {}, {}, {})}</div>
        <div class="${"svelte-1iwtxv7"}">${validate_component(ClubCard, "ClubCard").$$render($$result, {}, {}, {})}</div>
        <div class="${"svelte-1iwtxv7"}">${validate_component(ClubCard, "ClubCard").$$render($$result, {}, {}, {})}</div>
        <div class="${"svelte-1iwtxv7"}">${validate_component(ClubCard, "ClubCard").$$render($$result, {}, {}, {})}</div>
        <div class="${"svelte-1iwtxv7"}">${validate_component(ClubCard, "ClubCard").$$render($$result, {}, {}, {})}</div></main>
</div>`;
});
var clubs = /* @__PURE__ */ Object.freeze({
  __proto__: null,
  [Symbol.toStringTag]: "Module",
  default: Clubs
});
var $layout_svelte = "nav.svelte-rw583c{position:sticky;top:0;z-index:99;width:100%;height:56px;background:#231845}";
const css = {
  code: "nav.svelte-rw583c{position:sticky;top:0;z-index:99;width:100%;height:56px;background:#231845}",
  map: '{"version":3,"file":"$layout.svelte","sources":["$layout.svelte"],"sourcesContent":["<nav>\\n    <h1>NAV BAR</h1>\\n</nav>\\n\\n<slot />\\n\\n<style lang=\\"scss\\">nav {\\n  position: sticky;\\n  top: 0;\\n  z-index: 99;\\n  width: 100%;\\n  height: 56px;\\n  background: #231845;\\n}</style>\\n"],"names":[],"mappings":"AAMmB,GAAG,cAAC,CAAC,AACtB,QAAQ,CAAE,MAAM,CAChB,GAAG,CAAE,CAAC,CACN,OAAO,CAAE,EAAE,CACX,KAAK,CAAE,IAAI,CACX,MAAM,CAAE,IAAI,CACZ,UAAU,CAAE,OAAO,AACrB,CAAC"}'
};
const $layout = create_ssr_component(($$result, $$props, $$bindings, slots) => {
  $$result.css.add(css);
  return `<nav class="${"svelte-rw583c"}"><h1>NAV BAR</h1></nav>

${slots.default ? slots.default({}) : ``}`;
});
var $layout$1 = /* @__PURE__ */ Object.freeze({
  __proto__: null,
  [Symbol.toStringTag]: "Module",
  default: $layout
});
export {init, render};
