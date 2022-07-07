import winston from "winston";

winston.add(new winston.transports.Console());

import MongoUnit from 'mongo-unit';
import { UserDatabase } from "../../src/database/UserDatabase";
import { Db, MongoClient, ObjectId } from 'mongodb';

jest.setTimeout(20000);

describe('executing delete messages delete the proper entities', () => {

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
        await db.collection('details').insertMany([
            {
                _id: new ObjectId("56d9bf92f9be48771d6fe5b1"),
                email: "one@b.com",
                name: "name",
                uid: "uid1",
                username: "user one",
            }, {
                _id: new ObjectId("56d9bf92f9be48771d6fe5b2"),
                email: "two@b.com",
                name: "name",
                uid: "uid2",
                username: "user two",
            }, {
                _id: new ObjectId("56d9bf92f9be48771d6fe5b3"),
                email: "three@b.com",
                name: "name",
                uid: "uid3",
                username: "user three",
            }
        ]);
    });

    afterEach(async () => {
        await db.collection('details').deleteMany({});
        await MongoUnit.drop();
    })

    it('basic delete should succeed', async () => {
        const id = await database.delete({
            msg_intention: "DELETE",
            userID: 'anonymous',
            status: 0,
            msg_id: 0,
            id: 'uid1'
        });

        // Check the result is valid
        await expect(id).toHaveLength(1);

        // Then check that the database query returns the same data
        const results = await database.query({
            msg_intention: "READ",
            userID: 'anonymous',
            status: 0,
            msg_id: 0,
            includeEmail: true,
        });

        // Make sure only one result is given
        await expect(results).toHaveLength(2);
    });

    it('deleting with the ObjectID should not work', async () => {
        await expect(database.delete({
            msg_intention: "DELETE",
            userID: 'anonymous',
            status: 0,
            msg_id: 0,
            // @ts-ignore
            id: new ObjectId('56d9bf92f9be48771d6fe5b2')
        })).rejects.toThrowError('invalid ID type');

        // Then check that the database query returns the same data
        let results = await database.query({
            msg_intention: "READ",
            userID: 'anonymous',
            status: 0,
            msg_id: 0,
            includeEmail: true,
        });

        // Make sure only one result is given
        await expect(results).toHaveLength(3);

        await expect(database.delete({
            msg_intention: "DELETE",
            userID: 'anonymous',
            status: 0,
            msg_id: 0,
            id: '56d9bf92f9be48771d6fe5b2'
        })).rejects.toThrowError('invalid user ID')

        results = await database.query({
            msg_intention: "READ",
            userID: 'anonymous',
            status: 0,
            msg_id: 0,
            includeEmail: true,
        });

        // Make sure only one result is given
        await expect(results).toHaveLength(3);
    })

    it('deleting with additional properties acts normally', async () => {
        const id = await database.delete({
            msg_intention: "DELETE",
            userID: 'anonymous',
            status: 0,
            msg_id: 0,
            id: 'uid3',
            // @ts-ignore
            somethingElse: 'a',
        });

        // Check the result is valid
        await expect(id).toHaveLength(1);

        // Then check that the database query returns the same data
        const results = await database.query({
            msg_intention: "READ",
            userID: 'anonymous',
            status: 0,
            msg_id: 0,
        });

        // Make sure only one result is given
        await expect(results).toHaveLength(2);
    });
});
