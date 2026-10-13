"use strict";

(function (exports) {
  // A simple key value store using IndexedDB because it allows storage of
  // large amounts of data.
  class KeyValueStore {
    constructor(dbName, storeName) {
      this.storeName = storeName;
      this.dbPromise = new Promise((resolve, reject) => {
        const dbRequest = indexedDB.open(dbName, 1);
        dbRequest.onerror = () => reject(dbRequest.error);
        dbRequest.onsuccess = () => resolve(dbRequest.result);
        dbRequest.onupgradeneeded = () => {
          dbRequest.result.createObjectStore(storeName);
        };
      });
    }
    get(key) {
      return this.dbPromise.then(
        (db) =>
          new Promise((resolve, reject) => {
            const transaction = db.transaction(this.storeName, "readonly");
            const req = transaction.objectStore(this.storeName).get(key);
            transaction.oncomplete = () => resolve(req.result);
            transaction.onabort = transaction.onerror = () => {
              reject(transaction.error);
            };
          })
      );
    }
    set(key, value) {
      return this.dbPromise.then(
        (db) =>
          new Promise((resolve, reject) => {
            const transaction = db.transaction(this.storeName, "readwrite");
            const req = transaction.objectStore(this.storeName).put(value, key);
            transaction.oncomplete = () => resolve(req.result);
            transaction.onabort = transaction.onerror = () => {
              reject(transaction.error);
            };
          })
      );
    }
  }


  // Gamidio: the data package is served in numbered parts (file size limits of static hosts).
  async function gamidioFetchParts(url, parts, length, progressCallback) {
    const data = new ArrayBuffer(length);
    const view = new Uint8Array(data);
    let offset = 0;
    progressCallback(offset, length);
    for (let i = 0; i < parts; i++) {
      const response = await fetch(url + "." + i);
      if (!response.ok) throw new Error("Could not download " + url + "." + i + " (" + response.status + ")");
      const reader = response.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        view.set(value, offset);
        offset += value.length;
        progressCallback(offset, length);
      }
    }
    return data;
  }

  const kvstore = new KeyValueStore("data", "store");

  // Caches a single version of a resource
  class CachedResource {
    constructor(resourceUrl, key, keySuffix) {
      if (keySuffix === undefined) keySuffix = "";
      this.resourceUrl = resourceUrl;
      this.cacheKey = key + keySuffix;
    }
    async get(length, version, progressCallback = () => {}) {
      const cachedData = await kvstore.get(this.cacheKey);
      const cachedVersion = await kvstore.get(this.cacheKey + "-version");
      if (cachedData) {
        if (version === cachedVersion) {
          console.log(
            "Using cached resource",
            this.cacheKey,
            "originally downloaded from",
            this.resourceUrl
          );
          progressCallback(cachedData.byteLength, cachedData.byteLength, true);
          console.log("cached data:", cachedData);
          return cachedData;
        }
        console.log(
          "Out of date resource",
          this.cacheKey,
          "so redownloading from",
          this.resourceUrl
        );
        console.log(
          "required version",
          version,
          "but had version",
          cachedVersion,
          "stored"
        );
      }
      let data;

      if (window.GAMIDIO_DATA_PARTS && length) {
        data = await gamidioFetchParts(this.resourceUrl, window.GAMIDIO_DATA_PARTS, length, progressCallback);
      } else {
      const response = await fetch(this.resourceUrl);
      const headerContentLength = parseInt(
        response.headers.get("Content-Length")
      );
      // ContentLength header is not reliable: it might be the length of the compressed resource.
      // response.body is missing in Pale Moon, a Firefox fork that someone on the Endless Sky Discord server uses
      if (length && response.body) {
        // use a progress bar
        let offset = 0;
        data = new ArrayBuffer(length);
        const view = new Uint8Array(data);
        progressCallback(offset, length);
        const reader = response.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          view.set(value, offset);
          offset += value.length;
          progressCallback(offset, length);
        }
        progressCallback(offset, length);
      } else {
        // no progress bar
        progressCallback(0, headerContentLength);
        data = await response.arrayBuffer();
      }

      }
      console.log("downloaded", this.resourceUrl, data);
      try {
        await kvstore.set(this.cacheKey, data);
        await kvstore.set(this.cacheKey + "-version", version);
      } catch (e) {
        console.log(
          "Failure writing to IndexedDB, maybe private browsing / incognito mode or low on disk space"
        );
      }
      return data;
    }
  }

  window.CachedResource = CachedResource;
})();
