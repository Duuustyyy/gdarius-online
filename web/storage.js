const DB = "gd-files", STORE = "files";
const open = () => new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
});
export async function putFile(key, file) {
    navigator.storage?.persist?.();                       // ask the browser not to evict it
    const db = await open();
    return new Promise((res, rej) => {
        const t = db.transaction(STORE, "readwrite");
        t.objectStore(STORE).put(file, key);
        t.oncomplete = res; t.onerror = () => rej(t.error);
    });
}
export async function getFile(key) {
    const db = await open();
    return new Promise((res, rej) => {
        const r = db.transaction(STORE).objectStore(STORE).get(key);
        r.onsuccess = () => res(r.result || null); r.onerror = () => rej(r.error);
    });
}