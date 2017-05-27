"use strict"

const config = require("../config")
const dgram = require("dgram")
const debug = require("debug")("spider")
const log = require("debug")("spider:log")
const bencode = require("bencode")
const crypto = require("crypto")
const Emitter = require("events")
const ip = require("ip")
const database = require("./database")
const metadown = require("./metadown")
var stats = require('measured').createCollection();

class Spider extends Emitter {

    constructor (){
        super ()
        this.server = dgram.createSocket("udp4")
        this.id = Buffer.from(config.dhtId,'utf-8')
        this.db = new database()
        this.server.on("message",(message,peer)=> this._onServerMessage(message,peer))
        this.on("message",(message,peer)=>this._onMessage(message,peer))
        this.on("ping",(message,peer)=>this._onPing(message,peer))
        this.on("find_node",(message,peer)=>this._onfindNode(message,peer))
        this.on("get_peers",(message,peer)=>this._ongetPeers(message,peer))
        this.on("announce_peer",(message,peer)=>this._onannouncePeer(message,peer))
        this.setStatic()
    }

    setStatic(){
        this.findNodeTID=crypto.randomBytes(2)
        this.token=crypto.randomBytes(6)
    }

    decode(message){
        try {
        return bencode.decode(message)
        }
        catch(err) {}
    }

    neighbor(id){
        return new Buffer.concat([id.slice(0,6),this.id.slice(6,20)])
    }

    send(message,peer){
        if(peer.port>0 && peer.port <65536)
            this.server.send(bencode.encode(message),peer.port,peer.address)
    }

    encodeNodes(nodes){
        var result = []
        nodes.forEach((node,i)=>{
            result.push(this.encodeNode(node))
        })
        return new Buffer.concat(result)
    }

    encodeNode(node){
        var encoded = Buffer.allocUnsafe(26)
        encoded.write(node.id,'hex')
        //var ip = ipAddress.parse(node.address).to_hex()
        ip.toBuffer(node.address,encoded,20)
        //encode.write(ip,20,'hex')
        encoded.writeUInt16BE(node.port,24)
        //console.log(encoded)
        return encoded
    }

    decodeNodes(nlist){
        if(!nlist) return []
        var n=0
        var nodes=[]
        while(n<nlist.length){
        var node = {}
        node.id = nlist.slice(n,n+20).toString('hex')
        node.address = ip.fromLong(nlist.readUInt32BE(n+20))
        node.port = nlist.readUInt16BE(n+24)
        nodes.push(node)
        n += 26
        }
        return nodes
    }
    _onServerMessage(message,peer){
        var length = message.length
        message = this.decode(message)
        if(!message) return
        debug(`got: ${length}bytes from ${peer.address}:${peer.port}`)
        this.emit("message",message,peer)
    }

    _onMessage(message,peer){
        if(message.y =='q' && message.q){
            var commands=["ping","find_node","get_peers","announce_peer"]
            var command = message.q.toString()
            if(commands.includes(command)) {
                debug(`${message.q}: from ${peer.address}:${peer.port}`)
                this.emit(command,message,peer)
            } else {
            debug(`UNKNOWN ${message.q}: from ${peer.address}:${peer.port}`)
            }
        }
        if(message.y=='e') log(`${message.e[1].toString()} from ${peer.address}:${peer.port}`)
        if(message.y=='r') {
            if(message.t.equals(this.findNodeTID)){
                var found = this.decodeNodes(message.r.nodes)
                debug(`found ${found.length} nodes`)
                this.db.storeNodes(found)
            }
        }
    }

    _onPing(message,peer){
        var response ={
            t: message.t,
            y: 'r',
            r: {id:this.neighbor(message.a.id)}
        }
        this.send(response,peer)
        debug(`sent pong to ${peer.address}`)
    }

    _onfindNode(message,peer){
        this.db.getNodes((nodes)=>{
        if(!nodes||nodes.length==0) return
        var response = {
            t: message.t,
            y: 'r',
            r: {
                id:this.neighbor(message.a.id),
                nodes: this.encodeNodes(nodes)
                }
            }
        this.send(response,peer)
        debug(`sent nodes to ${peer.address}`)
        })
    }

    _ongetPeers(message,peer){
        this.db.getNodes((nodes)=>{
        if(!nodes||nodes.length==0) return
        var response = {
            t: message.t,
            y: 'r',
            r: {
                id:this.neighbor(message.a.id),
                nodes: this.encodeNodes(nodes),
                token: this.token
                }
            }
        this.send(response,peer)
        debug(`sent nodes reponse to get_peers to ${peer.address}`)
        })

    }

    _onannouncePeer(message,peer){
        if(!this.token.equals(message.a.token)) return
        var response ={
            t: message.t,
            y: 'r',
            r: {id:this.neighbor(message.a.id)}
        }
        this.send(response,peer)
        debug(`new announce from ${peer.address}`)
        var announce = {}
        announce.hash=message.a.info_hash.toString('hex')
        announce.address = peer.address
        if(message.a.implied_port||message.a.implied_port!=0) announce.port = peer.port
        else announce.port = message.a.port
        this.db.interested(announce.hash,(res)=>{
            if(!res) return
            metadown(announce,(meta)=>{
                stats.meter('requestsPerSecond').mark();
                this.db.gotMetadata(announce.hash)
                this.db.cacheMetadata(meta)
            })
        })
    }

    walk(){
        this.db.first((node)=>{
        var q = {
            t:this.findNodeTID,
            y:'q',
            q:'find_node',
            a:{
            id:this.neighbor(node.id),
            target:crypto.randomBytes(20)
            }
        }
        this.send(q,node)
        })
    }

    listen(port){
        this.server.bind(port)
        setInterval(()=>this.walk(),100)
        setInterval(()=>this.setStatic(),60000)
        setInterval(function() {
            log(stats.toJSON());
            }, 1000);
        log(`Listening on Port? ${port}`)
    }

}

const spider = new Spider()
spider.listen(config.dhtPort)
