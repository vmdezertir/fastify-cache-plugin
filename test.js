const server = require('fastify')({
	logger: true,
	maxParamLength: 200,
});
const options = {
	routes: [{
		path: '(.*)',
		expire: 30,
	}],
	exclude: ['/bar'],
	redisOpts: {
		host: '127.0.0.1',
		port: 6379,
	},
	protocol: 'http'
};
server.register(require('./plugin'), options);

server.get('/foo', (req, reply) => {
	setTimeout(() => {
		reply.send({ hello: 'World' })
	}, 2000);
});
server.get('/bar', (req, reply) => {
	setTimeout(() => {
		reply.send({ hello: `Universe ${Date.now()}` });
	}, 1000);
});

server.listen(3000, (err, address) => {
	if (err) {
		server.log.error(err);
		throw err;
	}
	server.log.info(`Server listening on ${address}`);
});
