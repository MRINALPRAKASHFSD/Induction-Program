// storage.js
const Storage = {
    get(key) {
        const item = localStorage.getItem(key);
        try {
            return item ? JSON.parse(item) : null;
        } catch(e) {
            return null;
        }
    },
    set(key, value) {
        localStorage.setItem(key, JSON.stringify(value));
    },
    remove(key) {
        localStorage.removeItem(key);
    },
    initArray(key) {
        if (!this.get(key) || !Array.isArray(this.get(key))) {
            this.set(key, []);
        }
    },
    push(key, item) {
        this.initArray(key);
        const arr = this.get(key);
        arr.push(item);
        this.set(key, arr);
    }
};
