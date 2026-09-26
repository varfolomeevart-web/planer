#!/usr/bin/env python3
"""Инъекция раннего <script> в статические HTML после экспорта Next.js.

Скрипт (ES5-совместимый) выполняется ДО загрузки чанков и делает две вещи:
1. Полифиллы runtime-методов для старых браузеров (Object.hasOwn, .at,
   replaceAll, allSettled, flat/flatMap, fromEntries, trimStart/End, globalThis).
2. Автоперезагрузка ОДИН раз при сбое загрузки JS/CSS-чанков (ChunkLoadError,
   обрыв сети), чтобы пользователь не видел «Application error» из-за случайного
   сетевого сбоя. Флаг в sessionStorage защищает от бесконечного цикла.
"""
import sys
from pathlib import Path

HEAD_SCRIPT = """<script>
(function(){
"use strict";
/* --- polyfills --- */
if(typeof globalThis==="undefined"){try{window.globalThis=window}catch(e){}}
if(!Object.hasOwn){Object.hasOwn=function(o,k){return Object.prototype.hasOwnProperty.call(o,k)}}
if(!Object.fromEntries){Object.fromEntries=function(it){var o={},a=[];try{a=Array.prototype.slice.call(it)}catch(e){return o}for(var i=0;i<a.length;i++){o[a[i][0]]=a[i][1]}return o}}
function rpAt(n){n=Math.trunc(n)||0;if(n<0)n+=this.length;if(n<0||n>=this.length)return undefined;return this[n]}
if(!Array.prototype.at){Array.prototype.at=rpAt}
if(!String.prototype.at){String.prototype.at=rpAt}
if(!Array.prototype.findLast){Array.prototype.findLast=function(f){for(var i=this.length-1;i>=0;i--){if(f(this[i],i,this))return this[i]}return undefined}}
if(!Array.prototype.findLastIndex){Array.prototype.findLastIndex=function(f){for(var i=this.length-1;i>=0;i--){if(f(this[i],i,this))return i}return -1}}
if(!String.prototype.replaceAll){String.prototype.replaceAll=function(s,r){if(s instanceof RegExp){if(!s.global)throw new TypeError("nonglobal regexp");return this.replace(s,r)}return this.split(String(s)).join(String(r))}}
if(!Promise.allSettled){Promise.allSettled=function(list){var a=Array.prototype.slice.call(list);return Promise.all(a.map(function(p){return Promise.resolve(p).then(function(v){return{status:"fulfilled",value:v}},function(e){return{status:"rejected",reason:e}})}))}}
function rpFlat(d){var out=[],self=this;function push(arr,lv){for(var i=0;i<arr.length;i++){if(Array.isArray(arr[i])&&lv>0){push(arr[i],lv-1)}else{out.push(arr[i])}}}push(self,d===undefined?1:(Math.trunc(d)||0));return out}
if(!Array.prototype.flat){Array.prototype.flat=rpFlat}
if(!Array.prototype.flatMap){Array.prototype.flatMap=function(f){return rpFlat.call(this.map(f),1)}}
if(!String.prototype.trimStart){String.prototype.trimStart=function(){return this.replace(/^\\s+/,"")}}
if(!String.prototype.trimEnd){String.prototype.trimEnd=function(){return this.replace(/\\s+$/,"")}}
if(!Array.prototype.includes){Array.prototype.includes=function(s){return this.indexOf(s)!==-1}}
/* --- авто-перезагрузка при сбое чанков (один раз) --- */
function isChunkMsg(m){return /ChunkLoadError|Loading chunk|dynamically imported module|Importing a module script failed|error loading dynamically/i.test(m||"")}
function onceReload(){var f=null;try{f=sessionStorage.getItem("rp_chunk_reload")}catch(e){}
if(f){return}
try{sessionStorage.setItem("rp_chunk_reload","1")}catch(e){}
setTimeout(function(){location.replace(location.href)},50)}
window.addEventListener("error",function(e){
var t=e&&e.target;
if(t&&(t.tagName==="SCRIPT"||t.tagName==="LINK"||t.tagName==="IMG")&&t!==window){onceReload();return}
if(isChunkMsg(e&&e.message)){onceReload()}},true);
window.addEventListener("unhandledrejection",function(e){var r=e&&e.reason;var m=(r&&r.message)||String(r||"");if(isChunkMsg(m)){onceReload()}});
window.addEventListener("load",function(){setTimeout(function(){try{sessionStorage.removeItem("rp_chunk_reload")}catch(e){}},8000)});
})();
</script>"""


def inject(html: str) -> str:
    if "rp_chunk_reload" in html:
        return html  # уже инъекцирован
    low = html.lower()
    idx = low.find("<head>")
    if idx != -1:
        pos = idx + len("<head>")
    else:
        idx = low.find("<html")
        if idx == -1:
            return html
        pos = html.find(">", idx)
        if pos == -1:
            return html
        pos += 1
    return html[:pos] + "\n" + HEAD_SCRIPT + "\n" + html[pos:]


def main() -> None:
    out_dir = Path(sys.argv[1] if len(sys.argv) > 1 else "out")
    files = list(out_dir.rglob("*.html"))
    if not files:
        print("INJECT: нет HTML файлов в", out_dir)
        sys.exit(1)
    for f in files:
        text = f.read_text(encoding="utf-8")
        patched = inject(text)
        if patched != text:
            f.write_text(patched, encoding="utf-8")
            print("INJECT: ok", f.relative_to(out_dir))
        else:
            print("INJECT: skip", f.relative_to(out_dir))


if __name__ == "__main__":
    main()
