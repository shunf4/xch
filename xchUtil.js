var globalTmp

var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
var __await = (this && this.__await) || function (v, d = false) {
    let a = this instanceof __await ? (this.v = v, this) : new __await(v, true);
    if (!d) {
        console.log(a);
    }
    return a
}
var __asyncGenerator = (this && this.__asyncGenerator) || function (thisArg, _arguments, generator) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var g = generator.apply(thisArg, _arguments || []), i, q = [];
    return i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i;
    function verb(n) { if (g[n]) i[n] = function (v) { 
        const x = new Promise(function (a, b) {
            if (!(q.push([n, v, a, b]) > 1)) {
                resume(n, v);
            }
        });
        console.log("verb Promise", x);
        console.trace();
        return x;
    }; }
    function resume(n, v) {
        try {
            const gnv = g[n](v)
            console.log("gnv", gnv);
            const stepGnv = step(
                gnv
            );
            console.log("stepGnv", stepGnv);
            //console.trace();
        } catch (e) { settle(q[0][3], e); } }
    function step(r) { r.value instanceof __await ? Promise.resolve(r.value.v).then(fulfill, reject) : settle(q[0][2], r); }
    function fulfill(value) { resume("next", value); }
    function reject(value) { resume("throw", value); }
    function settle(f, v) { if (f(v), q.shift(), q.length) resume(q[0][0], q[0][1]); }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ansi_256_colors_1 = __importDefault(require("ansi-256-colors"));
const errors_1 = require("./errors");
async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
exports.sleep = sleep;
function colorForRgb(r, g, b) {
    return ansi_256_colors_1.default.fg.getRgb(r, g, b).slice(7, -1);
}
exports.colorForRgb = colorForRgb;
function defaultTo(defaultValue) {
    function partialDefaultTo(sth) {
        if (sth === undefined || sth !== sth) {
            return defaultValue;
        }
        return sth;
    }
    return partialDefaultTo;
}
exports.defaultTo = defaultTo;
function doNotWait(promise) {
    void (promise);
}
exports.doNotWait = doNotWait;
function assignOptions(obj, options) {
    for (const [k, v] of Object.entries(options)) {
        obj[k] = v;
    }
}
exports.assignOptions = assignOptions;
function assertType(sth, typeSth, errorConstructor, sthStr) {
    const sthType = typeof sth;
    let types;
    if (typeof typeSth === "string") {
        types = [typeSth];
    }
    else {
        types = typeSth;
    }
    if (!(types.includes(sthType))) {
        throw new errorConstructor(`typeof ${sthStr} is ${sthType} (should be one of type(s): ${types.join(", ")})`);
    }
}
exports.assertType = assertType;
function assertInstanceOf(obj, clazzSth, errorConstructor, sthStr) {
    var _a;
    let clazzes;
    if (Array.isArray(clazzSth)) {
        clazzes = clazzSth;
    }
    else {
        clazzes = [clazzSth];
    }
    let match = false;
    for (const clazz of clazzes) {
        if ((obj instanceof clazz) || (clazz === Array && Array.isArray(obj))) {
            match = true;
            break;
        }
    }
    if (!match) {
        throw new errorConstructor(`${sthStr} is not instanceof one of class(es): ${clazzes.map(clazz => clazz.name).map(clazzName => clazzName ? clazzName : "<empty>").join(", ")} (it is a ${(_a = obj === null || obj === void 0 ? void 0 : obj.constructor) === null || _a === void 0 ? void 0 : _a.name})`);
    }
}
exports.assertInstanceOf = assertInstanceOf;
function assertTypeOrInstanceOf(sth, typeOrClass, errorConstructor, sthStr) {
    let typeOrClassArray;
    if (Array.isArray(typeOrClass)) {
        typeOrClassArray = typeOrClass;
    }
    else {
        typeOrClassArray = [typeOrClass];
    }
    const types = typeOrClassArray.filter(typeOrClass => typeof typeOrClass === "string");
    const clazzes = typeOrClassArray.filter(typeOrClass => typeof typeOrClass !== "string");
    try {
        assertType(sth, types, errorConstructor, sthStr);
    }
    catch (err) {
        if (!(err instanceof errorConstructor)) {
            throw err;
        }
        else {
            assertInstanceOf(sth, clazzes, errorConstructor, sthStr + `(also none of type(s): ${types.join(", ")})`);
        }
    }
}
exports.assertTypeOrInstanceOf = assertTypeOrInstanceOf;
function assertCondition(obj, conditionSth, errorConstructor, sthStr) {
    let conditionDisjunctiveNormal;
    if (typeof conditionSth === "function") {
        conditionDisjunctiveNormal = [[conditionSth]];
    }
    else if (conditionSth instanceof Array) {
        const conditionArray = conditionSth;
        if (conditionArray.length === 0) {
            conditionDisjunctiveNormal = [];
        }
        else {
            if (conditionArray.every(c => c instanceof Array && c.every(e => typeof e === "function"))) {
                conditionDisjunctiveNormal = conditionArray;
            }
            else {
                throw new errors_1.RuntimeLogicError(`runtime logic error: conditionSth is none of {function[][],  function[], function}`);
            }
        }
    }
    const disjunctiveNormalRecords = [];
    let disjunctiveNormalSatisfied = false;
    for (const conjunction of conditionDisjunctiveNormal) {
        const conjunctionRecords = [];
        disjunctiveNormalRecords.push(conjunctionRecords);
        let conjunctionSatisfied = false;
        for (const condition of conjunction) {
            if (condition(obj)) {
                conjunctionRecords.push([condition.name, true]);
                if (!conjunctionSatisfied) {
                    conjunctionSatisfied = true;
                }
            }
            else {
                conjunctionRecords.push([condition.name, false]);
                conjunctionSatisfied = false;
                break;
            }
        }
        if (conjunctionSatisfied) {
            disjunctiveNormalSatisfied = true;
            break;
        }
    }
    if (!disjunctiveNormalSatisfied) {
        const recordStrings = [];
        let firstConjunctionRecords = true;
        for (const conjunctionRecords of disjunctiveNormalRecords) {
            if (firstConjunctionRecords) {
                firstConjunctionRecords = false;
            }
            else {
                recordStrings.push("∨");
            }
            recordStrings.push("[");
            let firstRecord = true;
            for (const [conditionName, isSatisfied] of conjunctionRecords) {
                if (firstRecord) {
                    firstRecord = false;
                }
                else {
                    recordStrings.push("∧");
                }
                recordStrings.push(`(${conditionName}: ${isSatisfied ? "T" : "F"})`);
            }
            recordStrings.push("]");
        }
        throw new errorConstructor(`${sthStr} does not satisfy the condition DNF: ${recordStrings.join("")}`);
    }
}
exports.assertCondition = assertCondition;
function wrapAsNamedFunction(func, name, args = []) {
    return Object.defineProperty(func, "name", {
        value: `${name}(${args.map(arg => arg.toString()).join(", ")})`,
        writable: false
    });
}
exports.wrapAsNamedFunction = wrapAsNamedFunction;
function passesAssertion(func, ...args) {
    try {
        func(...args);
    }
    catch (err) {
        return false;
    }
    return true;
}
exports.passesAssertion = passesAssertion;
function stringIsEmpty(s) {
    return s === "";
}
exports.stringIsEmpty = stringIsEmpty;
function stringIsNotEmpty(s) {
    return s !== "";
}
exports.stringIsNotEmpty = stringIsNotEmpty;
function greaterThan(num) {
    return wrapAsNamedFunction((numArg) => numArg > num, arguments.callee.name, Array.from(arguments));
}
exports.greaterThan = greaterThan;
function lessThan(num) {
    return wrapAsNamedFunction((numArg) => numArg < num, arguments.callee.name, Array.from(arguments));
}
exports.lessThan = lessThan;
function greaterThanOrEqualTo(num) {
    return wrapAsNamedFunction((numArg) => numArg >= num, arguments.callee.name, Array.from(arguments));
}
exports.greaterThanOrEqualTo = greaterThanOrEqualTo;
function lessThanOrEqualTo(num) {
    return wrapAsNamedFunction((numArg) => numArg <= num, arguments.callee.name, Array.from(arguments));
}
exports.lessThanOrEqualTo = lessThanOrEqualTo;
function isJsonPlain(sth) {
    return (sth === null || typeof sth === "string" || typeof sth === "boolean" || typeof sth === "number" || Array.isArray(sth) || sth.constructor === Object && sth.toString() === "[object Object]");
}
exports.isJsonPlain = isJsonPlain;
function isJsonSerializable(sth) {
    if (!isJsonPlain(sth)) {
        return false;
    }
    if (sth === null) {
        return true;
    }
    if (typeof sth !== "object") {
        return false;
    }
    for (const property in sth) {
        if (Object.hasOwnProperty.call(sth, property)) {
            if (!isJsonPlain(sth[property])) {
                return false;
            }
            if (typeof sth[property] === "object") {
                if (!isJsonSerializable(sth[property])) {
                    return false;
                }
            }
        }
    }
    return true;
}
exports.isJsonSerializable = isJsonSerializable;
function isNotNullNorUndefined(sth) {
    return sth !== null && sth !== undefined;
}
exports.isNotNullNorUndefined = isNotNullNorUndefined;
exports.itJson = {
    decoder: (source) => (function () {
        return __asyncGenerator(this, arguments, function* () {
            var e_1, _a;
            try {
                for (var source_1 = __asyncValues(source), source_1_1; source_1_1 = yield __await(source_1.next()), !source_1_1.done;) {
                    const messageRaw = source_1_1.value;
                    yield yield __await(JSON.parse(messageRaw.toString("utf-8")));
                }
            }
            catch (e_1_1) { e_1 = { error: e_1_1 }; }
            finally {
                try {
                    if (source_1_1 && !source_1_1.done && (_a = source_1.return)) yield __await(_a.call(source_1));
                }
                finally { if (e_1) throw e_1.error; }
            }
        });
    })(),
    encoder: (source) => (function () {
        return __asyncGenerator(this, arguments, function* () {
            var e_2, _a;
            try {
                var source_2 = __asyncValues(source), source_2_1;
                while (true) {
                    var x1 = source_2.next();
                    console.log("x1", x1);
                    var x2 = __await(x1);
                    console.log("x2", x2);
                    debugger;
                    globalTmp = x2;
                    source_2_1 = yield x2;
                    console.log("source_2_1", source_2_1);
                    if (source_2_1.done) {
                        break;
                    }

                    const objRaw = source_2_1.value;
                    yield yield __await(Buffer.from(JSON.stringify(objRaw), "utf-8"));
                }
            }
            catch (e_2_1) { e_2 = { error: e_2_1 }; }
            finally {
                try {
                    if (source_2_1 && !source_2_1.done && (_a = source_2.return)) yield __await(_a.call(source_2));
                }
                finally { if (e_2) throw e_2.error; }
            }
            console.log("end");
        });
    })(),
};
//# sourceMappingURL=xchUtil.js.map