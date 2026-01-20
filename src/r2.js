export class R2Helper {
    constructor(bucket) {
        this.bucket = bucket;
    }

    async put(key, stream, options = {}) {
        return await this.bucket.put(key, stream, options);
    }

    async get(key) {
        return await this.bucket.get(key);
    }

    async delete(key) {
        return await this.bucket.delete(key);
    }

    async getHead(key) {
        return await this.bucket.head(key);
    }
}
