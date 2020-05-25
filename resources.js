const ds = require('data-store');
const fs = require('fs');

class Resources {
    db=null;
    constructor(dbPath) {
        this.db = ds({ path: dbPath });
        this.houseKeeping();
        setInterval(this.houseKeeping, 10000);
    }
    houseKeeping=()=> {
        var keys = Object.keys(this.db.get());
        var dt = new Date().getTime();
        keys.forEach(key => {
            var rec = this.db.get(key);
            if (rec.ttl != null) {
                if (dt > rec.addedOn + rec.ttl) {
                    //time to remove
                    this.db.del(key);
                    if(rec.delFile){
                        fs.unlink(rec.path);
                    }
                }
            }
        });
    }
    register(pth, ttl = null, delFile = false) {
        const id = crypto.randomBytes(17).toString('hex');
        var dt = new Date().getTime();
        this.db.set(id, { path: pth, ttl, addedOn: dt, delFile });
        return id;
    }
    getPath(id) {
        var pth = null;
        var rec = this.db.get(id);
        if (rec != undefined && rec != null) {
            if (rec.ttl != null) {
                var dt = new Date().getTime();
                if (rec.addedOn + rec.ttl >= dt)
                    pth = rec.path;
            }
            else {
                pth = rec.path;
            }
        }
        return pth;
    }
    unregister(key){
        this.db.del(key);
    }
}

module.exports=Resources;