"use strict"
var redis = require ("redis")
var mongo = require ("mongodb").MongoClient
var mongodb


var rClient = redis.createClient()

var config = require("../config.js")

const debug = require("debug")("database")

class Database {
    constructor(){
    mongo.connect(config.mongoUrl, function(err, db) {
        if(err) return
        debug("MongoDb: " + config.mongoUrl);
        mongodb=db;
    })
    }

    syncro(){
        var coll = mongodb.collection("torrents")
        var multi = rClient.multi()
        coll.distinct('hash',(err,docs)=>{
            docs.forEach((hash,i)=>{
                multi.sadd("knownHash",hash)
            })
            multi.exec((err,replies)=> console.log(err))
        })
    }

    interested(hash,callback){
      rClient.sismember("knownHash",hash,(err,result)=> {
            var res = false
            if(!result) res=true
            callback(res)
            debug("interest: " + !!result)
        })
    }

    gotMetadata(infoHash){
        debug("downloaded: "+infoHash)
        rClient.sadd('knownHash',infoHash)
        rClient.srem('pendingHash',infoHash)
        }

    putMeta(metadata){
    var coll = mongodb.collection("torrents")
    //console.log(`base dir: ${metadata.info.name.toString('utf-8')}`)
    metadata = this.sanitize(metadata)
    if(metadata.info.files){
    var baseDir = metadata.info.name.toString('utf-8')
    metadata.keys = baseDir
    metadata.info.files.forEach((file,index)=>{
        var path = new Buffer.concat(file.path).toString('utf-8')
        //console.log(`path: ${path}`)
        metadata.keys+=" "
        metadata.keys+=path
    })
    } else {
    metadata.keys = metadata.info.name.toString('utf-8')
    }
    coll.insert(metadata,function(err,res){
        if(err) {
        console.log(`error ${err.errmsg}`)
        //console.log(JSON.stringify(metadata))
        Object.keys(metadata.info).forEach(function (key){
            if(key.includes('.')) console.log(key)})
        }
    })
    }
    
    sanitize(metadata){
    Object.keys(metadata.info).forEach(function (key){
        if(key.includes('.')) {
            metadata.info[key.split('.').join('_')]=metadata.info[key]
            delete metadata.info[key]
            }
    })
    if(metadata.info.files){
        metadata.info.files.forEach((file,index)=>{
            Object.keys(file).forEach(function (key){
                if(key.includes('.')) {
                    file[key.split('.').join('_')]=file[key]
                    delete file[key]
                    metadata.info.files[index] = file
                    }
            })
        })
    }
    return metadata
    }
    
    cacheMetadata(data){
        var coll = mongodb.collection("cache")
        coll.insert({data:data},(err,res)=>{
            debug("caching: " + data.length + " bytes whith err:" + err)
            })
    }
    
    getNodes(callback){
        rClient.lrange("nodes",0,7,(err,res)=>{
            if(!res) return
            var nodes=[]
            res.forEach((node,i)=>{
                nodes.push(JSON.parse(node))
            })
            callback(nodes)
        })
    }

    first(callback){
        rClient.lpop("nodes",(err,res)=>{
        res = JSON.parse(res)
        res.id = Buffer.from(res.id,'hex')
        callback(res)
        })
    }
    
    storeNodes(nodes){
        var multi = rClient.multi()
        nodes.forEach((n,i)=>{
            multi.rpush("nodes",JSON.stringify(n))
        })
        multi.exec()
    }
}

module.exports=Database
