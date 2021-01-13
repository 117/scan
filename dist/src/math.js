"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.change = void 0;
function change(params) {
    return ((params.to - params.from) / params.from) * (params.factor ?? 100);
}
exports.change = change;
exports.default = {
    change: change,
};
