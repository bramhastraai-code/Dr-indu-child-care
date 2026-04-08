const app = require('./src/app');
const fs = require('fs');

const routes = [];
app._router.stack.forEach(middleware => {
    if(middleware.route){
        routes.push(Object.keys(middleware.route.methods)[0].toUpperCase() + ' ' + middleware.route.path);
    } else if(middleware.name === 'router'){
        // Clean up the express regexp string to get the base path
        let prefix = middleware.regexp.source;
        prefix = prefix.replace('^\\', '').replace('\\/?(?=\\/|$)', '');
        prefix = prefix.replace(/\^/g,'').replace(/\\/g, '').replace(/\?\(\=\/\/\$\)/g, '');
        // Hacky way to fix the prefix, usually looks like "/api/admin"
        if(prefix.includes('api')){
            prefix = '/api/' + prefix.split('api')[1].split('/')[0];
            if (prefix.endsWith('?(')) { prefix = prefix.substring(0, prefix.length - 2); }
        }
        
        middleware.handle.stack.forEach(handler => {
            if(handler.route){
               routes.push(Object.keys(handler.route.methods)[0].toUpperCase() + ' ' + prefix + handler.route.path);
            }
        });
    }
});

fs.writeFileSync('routes_list.txt', routes.join('\n'));
console.log('Routes written to routes_list.txt');
process.exit(0);
