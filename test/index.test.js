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
server.register(require('../index'), options);

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

// Run the server!
const start = async () => {
	try {
		await server.listen({ port: 3000 });
	} catch (err) {
		server.log.error(err)
		process.exit(1)
	}
}
start();
