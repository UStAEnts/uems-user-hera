import {UserMessage, UserResponse} from "@uems/uemscommlib";
import {Collection, Db, FilterQuery, ObjectId, UpdateOneOptions, UpdateQuery} from "mongodb";
import ReadUserMessage = UserMessage.ReadUserMessage;
import CreateUserMessage = UserMessage.CreateUserMessage;
import DeleteUserMessage = UserMessage.DeleteUserMessage;
import UpdateUserMessage = UserMessage.UpdateUserMessage;
import InternalUser = UserResponse.InternalUser;
import {union} from "zod";
import {ClientFacingError} from "../error/ClientFacingError";
import {GenericMongoDatabase, MongoDBConfiguration} from "@uems/micro-builder/build/src";

export type InDatabaseUser = {
    _id: ObjectId,
    email: string,
    name: string,
    uid: string,
    username: string,
    profile?: string,
};

export type CreateInDatabaseUser = Omit<InDatabaseUser, '_id'>;

const stripUndefined = <T>(data: T): T => Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)) as unknown as T;

const dbToInternal = (data: InDatabaseUser, withEmail: boolean): InternalUser => stripUndefined({
    username: data.username,
    id: data.uid,
    name: data.name,
    profile: data.profile,
    email: withEmail ? data.email : undefined,
});

const createToDb = (data: CreateUserMessage): CreateInDatabaseUser => stripUndefined({
    name: data.name,
    email: data.email,
    uid: data.id,
    username: data.username,
    profile: data.profile,
});

export class UserDatabase extends GenericMongoDatabase<ReadUserMessage, CreateUserMessage, DeleteUserMessage, UpdateUserMessage, InternalUser> {

    public constructor(_configuration: MongoDBConfiguration);
    public constructor(database: Db, collections: MongoDBConfiguration['collections']);
    public constructor(_configurationOrDB: MongoDBConfiguration | Db, collections?: MongoDBConfiguration['collections']);
    constructor(configurationOrDB: MongoDBConfiguration | Db, collections?: MongoDBConfiguration['collections']) {
        super(configurationOrDB, collections);

        const register = (details: Collection) => {
            void details.createIndexes([
                {key: {username: 1}, name: 'unique-username', unique: true},
                {key: {email: 1}, name: 'unique-email', unique: true},
                {key: {uid: 1}, name: 'unique-uid', unique: true},
            ]);
        };

        if (this._details) {
            register(this._details);
        } else {
            this.once('ready', () => {
                if (!this._details) throw new Error('Details db was not initialised on ready');
                register(this._details);
            });
        }
    }

    protected async createImpl(create: UserMessage.CreateUserMessage, details: Collection): Promise<string[]> {
        const {msg_id, msg_intention, status, ...document} = create;

        const targetDocument = createToDb(create);
        let result;

        try {
            result = await details.insertOne(targetDocument);
        } catch (e: any) {
            if (e.code === 11000) {
                // TODO : there should be a better way to do this but I'm currently running into issues with mongodb not
                //   returning the index that is being violated. When running tests locally it returns the following
                //   error: MongoError: E11000 duplicate key error dup key: { : "duplicated username" }
                //   but as this doesn't contain the index name I can't tell which value is violating it. So I'm going
                //   to cheat and first check if it will return the index value to handle how the system it meant to
                //   work (which was apparently fixed?). If that doesn't match anything, I'm going to compare the query
                //   value. This will fail if values are the same (such as username === uid) but that would probably
                //   happen with mongodb anyway. I'm going to do it in the order of the indexes being created but I
                //   don't know how mongodb orders its indexes
                if (e.message.includes('unique-username')) throw new ClientFacingError('username already claimed');
                if (e.message.includes('unique-email')) throw new ClientFacingError('email already claimed');
                if (e.message.includes('unique-uid')) throw new ClientFacingError('user ID already claimed');
                if (e.message.includes(`"${create.username}"`)) throw new ClientFacingError('username already claimed');
                if (e.message.includes(`"${create.email}"`)) throw new ClientFacingError('email already claimed');
                if (e.message.includes(`"${create.id}"`)) throw new ClientFacingError('user ID already claimed');
            }
            throw e;
        }

        if (result.insertedCount !== 1 || result.insertedId === undefined) {
            throw new Error('failed to insert')
        }

        const id = (result.insertedId as ObjectId).toHexString();
        await super.log(id, 'inserted');

        // @ts-ignore
        return [targetDocument.uid];
    }

    protected async deleteImpl(remove: UserMessage.DeleteUserMessage, details: Collection): Promise<string[]> {
        const {id} = remove;
        if (typeof (id) !== 'string') throw new ClientFacingError('invalid ID type');

        const query = {
            uid: id,
        };

        const result = await details
            .deleteOne(query);

        if (result.deletedCount !== 1) {
            throw new ClientFacingError('invalid user ID');
        }

        if (result.result.ok !== 1) {
            throw new Error('failed to delete');
        }

        await this.log(id, 'deleted');

        return [id];
    }

    protected async queryImpl(query: UserMessage.ReadUserMessage, details: Collection): Promise<InternalUser[]> {
        const find: Record<string, unknown> = {};

        if (query.id) {
            if (typeof (query.id) === 'string') {
                find.uid = query.id;
            } else {
                find.uid = {
                    $in: query.id,
                }
            }
        }

        if (query.name) {
            find.$text = {
                $search: query.name,
            };
        }

        if (query.username) {
            find.$text = {
                $search: find.$text ? (`${(find.$text as any).$search} ${query.username}`) : query.username,
            };
        }

        if (query.email) {
            find.email = query.email;
        }

        return (await details.find(find).toArray())
            .map((d) => dbToInternal(d, query.includeEmail ?? false));
    }

    protected async updateImpl(update: UserMessage.UpdateUserMessage, details: Collection): Promise<string[]> {
        const filter: FilterQuery<InDatabaseUser> = {
            uid: update.id,
        };

        const changes: UpdateQuery<InDatabaseUser> = {
            $set: {
                ...(update.profile ? {profile: update.profile} : {}),
                ...(update.username ? {username: update.username} : {}),
                ...(update.email ? {email: update.email} : {}),
                ...(update.name ? {name: update.name} : {}),
            }
        }

        if (Object.keys(changes.$set ?? {}).length === 0) {
            throw new ClientFacingError('no operations provided');
        }

        const result = await details.updateOne(filter, changes);

        if (result.matchedCount === 0) {
            throw new ClientFacingError('invalid user ID');
        }

        if (result.result.ok !== 1) {
            throw new Error('failed to delete');
        }

        return [update.id];
    }

    public async assert(assert: UserMessage.AssertUserMessage): Promise<void> {
        if (!this._details) {
            throw new Error('database not initialised before assert');
        }

        const upsert: UpdateQuery<InternalUser> = {
            $set: {
                email: assert.email,
                name: assert.name,
                uid: assert.id,
                username: assert.username,
            },
        }

        const options: UpdateOneOptions = {
            upsert: true,
        }

        await this._details.updateOne({
            uid: assert.id,
        }, upsert, options)
    }

}
