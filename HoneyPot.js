"use strict"
const cluster = require('cluster');
const numCPUs = require('os').cpus().length;
const config=require("./config")

console.log("Starting HoneyPot.")

cluster.setupMaster({exec: "./lib/honeyPot.js"})

if (cluster.isMaster) {
    console.log(`Master ${process.pid} is running`);
    //spawn workers
    for (let i = 0; i < numCPUs*2; i++) {
        cluster.fork()
        }
    cluster.on('exit', (worker, code, signal) => {
        console.log(`worker ${worker.process.pid} died`);
    });

    cluster.on('listening', (worker, address) => {
      console.log(
        `A worker is now connected to ${address.address}:${address.port}`);
    });

} else {
    //console.log(`Worker ${process.pid} started`);
    
    /*
    const net = require('net')
    const server = net.createServer((socket)=>{
        socket.write(""+process.pid)
    })

    server.listen(config.torrentPort)
    */
}
