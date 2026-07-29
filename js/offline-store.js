window.OfflineStore = (() => {
  "use strict";
  const DB_NAME = "fire-water-map";
  const DB_VERSION = 1;
  const POINTS_KEY = "fwm.cachedPoints.v1";
  function openDb(){return new Promise((resolve,reject)=>{const r=indexedDB.open(DB_NAME,DB_VERSION);r.onupgradeneeded=()=>{const db=r.result;if(!db.objectStoreNames.contains("submissionQueue"))db.createObjectStore("submissionQueue",{keyPath:"id"});};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
  function cachePoints(points){localStorage.setItem(POINTS_KEY,JSON.stringify({savedAt:new Date().toISOString(),points}));}
  function cachedPoints(){try{return JSON.parse(localStorage.getItem(POINTS_KEY)||"null");}catch{return null;}}
  async function queueSubmission(payload){const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction("submissionQueue","readwrite");tx.objectStore("submissionQueue").put({id:crypto.randomUUID(),createdAt:new Date().toISOString(),payload});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}
  async function queuedSubmissions(){const db=await openDb();return new Promise((resolve,reject)=>{const r=db.transaction("submissionQueue").objectStore("submissionQueue").getAll();r.onsuccess=()=>resolve(r.result||[]);r.onerror=()=>reject(r.error);});}
  async function removeSubmission(id){const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction("submissionQueue","readwrite");tx.objectStore("submissionQueue").delete(id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}
  async function syncSubmissions(send){if(!navigator.onLine)return 0;let count=0;for(const item of await queuedSubmissions()){try{await send(item.payload);await removeSubmission(item.id);count++;}catch(e){console.warn("Queued submission remains pending",e);}}return count;}
  return {cachePoints,cachedPoints,queueSubmission,queuedSubmissions,syncSubmissions};
})();
