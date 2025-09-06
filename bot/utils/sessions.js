export class SessionManager {
    constructor() {
        this.sessions = new Map();
    }

    set(userId, data) {
        this.sessions.set(userId, data);
    }

    get(userId) {
        return this.sessions.get(userId);
    }

    delete(userId) {
        this.sessions.delete(userId);
    }

    has(userId) {
        return this.sessions.has(userId);
    }
}

export const sessionManager = new SessionManager();
