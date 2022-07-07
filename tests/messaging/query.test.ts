import winston from "winston";

winston.add(new winston.transports.Console());

import MongoUnit from 'mongo-unit';
import { UserDatabase } from "../../src/database/UserDatabase";
import { Db, MongoClient, ObjectId } from 'mongodb';

jest.setTimeout(20000);

const initData = [
    {
        _id: new ObjectId("56d9bf92f9be48771d6fe5b1"),
        email: "email one",
        name: "name one",
        uid: "uid one",
        username: "username one",
    }, {
        _id: new ObjectId("56d9bf92f9be48771d6fe5b2"),
        email: "email two",
        name: "name two",
        uid: "uid two",
        username: "username two",
    }, {
        _id: new ObjectId("56d9bf92f9be48771d6fe5b3"),
        email: "email three",
        name: "name three",
        uid: "uid three",
        username: "username three",
    }
];

describe('executing query messages query the proper entities', () => {

    let client: MongoClient;
    let db: Db;
    let database: UserDatabase;

    beforeAll(async () => {
        // Setup the in memory mongo db database
        await MongoUnit.start();

        // Create the database connection and connect to the one we just created in memory
        client = new MongoClient(MongoUnit.getUrl(), {
            useUnifiedTopology: true,
        });
        await client.connect();

        // Then create a user database around this
        db = client.db('testing');
        await db.collection('details').createIndex({ name: 'text', username: 'text' });

        database = new UserDatabase(db, {
            details: 'details',
            changelog: 'changelog',
        });
    });

    afterAll(() => {
        // Shutdown our connection to the database
        client.close();

        // Then stop the in memory database
        MongoUnit.stop();
    });

    // Before we begin each test we'll reset the database to make sure that we start on a clean slate
    beforeEach(async () => {
        await db.collection('details').insertMany(initData);
    });

    afterEach(async () => {
        await db.collection('details').deleteMany({});
        await MongoUnit.drop();
    })

    it('query does not include email by default', async () => {
        const results = await database.query({
            msg_intention: "READ",
            userID: 'anonymous',
            status: 0,
            msg_id: 0,
        });

        await expect(results).toHaveLength(3);
        await Promise.all(results.map(async (e) => {
            await expect(e.email).toBeUndefined();
        }));
    })


    it('query includes email upon request', async () => {
        const results = await database.query({
            msg_intention: "READ",
            userID: 'anonymous',
            status: 0,
            msg_id: 0,
            includeEmail: true,
        });

        await expect(results).toHaveLength(3);
        await Promise.all(results.map(async (e) => {
            await expect(e).toHaveProperty('email');
        }));
    });

    it('query by object ID does not match', async () => {
        const results = await database.query({
            msg_intention: "READ",
            userID: 'anonymous',
            status: 0,
            msg_id: 0,
            id: '56d9bf92f9be48771d6fe5b1',
        });

        await expect(results).toHaveLength(0);
    });

    it('empty query returns all objects', async () => {
        const results = await database.query({
            msg_intention: "READ",
            userID: 'anonymous',
            status: 0,
            msg_id: 0,
        });

        await expect(results).toHaveLength(3);
        await expect(results).toEqual([
            {
                name: "name one",
                id: "uid one",
                username: "username one",
            }, {
                name: "name two",
                id: "uid two",
                username: "username two",
            }, {
                name: "name three",
                id: "uid three",
                username: "username three",
            }
        ]);
    });

    it('can query by email', async () => {
        const results = await database.query({
            msg_intention: "READ",
            userID: 'anonymous',
            status: 0,
            msg_id: 0,
            email: 'email one',
        });

        await expect(results).toHaveLength(1);
        await expect(results[0].username).toEqual('username one');
        await expect(results[0].name).toEqual('name one');
    })

    it('can query by substring of name', async () => {
        const results = await database.query({
            msg_intention: "READ",
            userID: 'anonymous',
            status: 0,
            msg_id: 0,
            name: 'one',
        });

        await expect(results).toHaveLength(1);
        await expect(results[0].username).toEqual('username one');
        await expect(results[0].name).toEqual('name one');
    })

    it('can query by substring of username', async () => {
        const results = await database.query({
            msg_intention: "READ",
            userID: 'anonymous',
            status: 0,
            msg_id: 0,
            username: 'two',
        });

        await expect(results).toHaveLength(1);
        await expect(results[0].username).toEqual('username two');
        await expect(results[0].name).toEqual('name two');
    })

    it('can combine substring query of name and username', async () => {
        const results = await database.query({
            msg_intention: "READ",
            userID: 'anonymous',
            status: 0,
            msg_id: 0,
            name: 'two',
            username: 'one',
        });

        await expect(results).toHaveLength(2);
        await expect(results).toEqual([
            {
                name: "name one",
                id: "uid one",
                username: "username one",
            }, {
                name: "name two",
                id: "uid two",
                username: "username two",
            }
        ]);
    })

    it('queries only return internal user properties', async () => {
        const results = await database.query({
            msg_intention: "READ",
            userID: 'anonymous',
            status: 0,
            msg_id: 0,
            id: 'uid one',
        });

        await Promise.all(results.map(async (e) => {
            const allowed = ['email', 'username', 'name', 'id', 'profile'];
            for (const key of Object.keys(results[0])) {
                expect(allowed).toContain(key);
            }
        }));
    })

    it('query by ID returns one valid result', async () => {
        const results = await database.query({
            msg_intention: "READ",
            userID: 'anonymous',
            status: 0,
            msg_id: 0,
            id: 'uid one',
        });

        // Check the result is valid
        await expect(results).toHaveLength(1);

        // Check that the data matches
        await expect(results[0].username).toEqual('username one');
        await expect(results[0].name).toEqual('name one');
    });

});
