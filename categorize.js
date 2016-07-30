"use strict";

const config = require('./config/database');

const mongoose = require('mongoose');
mongoose.connect(config.db.uri);

const path = require('path');

const Torrent = require('./models/Torrent.js');

const bunyan = require("bunyan");
const logger = bunyan.createLogger({name: "categorize"});

const filter = { 'category' : /Unknown/ };

const specialIgnores = () => {
  const pad = (n, width, z) => {
    z = z || '0';
    n = n + '';
    return n.length >= width ? n : new Array(width - n.length + 1).join(z) + n;
  }
  const result = [];
  for(var i=2; i<100; i++) {
    result.push('.s'+pad(i,2));
    result.push('.r'+pad(i,2));
    result.push('.z'+pad(i,2));
    result.push('.'+pad(i,2));
  }
  for(var i=2; i<1000; i++) {
    result.push('.s'+pad(i,3));
    result.push('.r'+pad(i,3));
    result.push('.z'+pad(i,3));
    result.push('.'+pad(i,3));
  }
  return result;
}

const stream = Torrent.find(filter).sort({'imported': -1}).limit(100).stream();
stream.on('data', function(torrent){
  logger.info(`Treating ${torrent._id} categorization`);
  stream.pause();
  if(!torrent.files) {
    logger.info(`Torrent ${torrent._id} has no files!`);
    stream.resume();
    return;
  }

  const exts = torrent.files
    .map(file => path.extname(file).toLowerCase())
    .filter(ext => ext.length > 0) // no empty
    .filter(ext => !config.extToIgnore.includes(ext)) // no ignored
    .filter(ext => !specialIgnores().includes(ext)) // no special ignored
    .filter(ext => ext.length < config.limitExt) // with min length
    .slice() // shallow copy
    .sort() // sort
    .reduce((p, c) => {
      if(p[0] !== c) return p.concat(c);
      return p;
    }, []) // deduplicate

  if(exts.length > 5) {
    logger.info(`Torrent ${torrent._id} has no too many extensions!`);
    stream.resume();
    return;
  }

  const category = Object.keys(config.extToCateg)
    .map(categ => { // browse category extensions
      if ( config.extToCateg[categ].some(c => exts.includes(c)) )
      return categ;
    })
    .find((c) => c !== undefined); // find the first category

  torrent.category = category || "Unknown";
  torrent.save(function(err){
    if(err) {logger.error(err); process.exit(1);}
    logger.info(torrent._id+" categorized as "+category+"!");
    stream.resume();
  })
})

stream.on('error', function(err) {
  logger.info("Error : "+err); process.exit(1);
});

stream.on('close', function(){
  process.exit();
});
