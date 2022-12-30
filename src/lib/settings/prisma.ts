import { Activity, activity_type_enum, Prisma, PrismaClient } from '@prisma/client';
import { objectEntries } from 'e';

import { CLIENT_ID, production } from '../../config';
import type { ActivityTaskData, ActivityTaskOptions } from '../types/minions';

declare global {
	namespace NodeJS {
		interface Global {
			prisma: PrismaClient | undefined;
		}
	}
}
export const prisma =
	global.prisma ||
	new PrismaClient({
		log: [
			{
				emit: 'event',
				level: 'query'
			}
		]
	});
if (!production) global.prisma = prisma;

export const prismaQueries: Prisma.QueryEvent[] = [];
export let queryCountStore = { value: 0 };
prisma.$on('query' as any, (_query: any) => {
	if (!production && globalClient.isReady()) {
		const query = _query as Prisma.QueryEvent;
		prismaQueries.push(query);
	}
	queryCountStore.value++;
});

const ACTIVITY_DATA_COMPRESSION_MAPPINGS = [
	{
		from: 'monsterID',
		to: 'mi'
	},
	{
		from: 'quantity',
		to: 'q'
	},
	{
		from: 'burstOrBarrage',
		to: 'bob'
	},
	{
		from: 'cannonMulti',
		to: 'cmu'
	},
	{
		from: 'usingCannon',
		to: 'uc'
	},
	{
		from: 'plantsName',
		to: 'pn'
	}
] as const;

export function convertStoredActivityToFlatActivity(_activity: Activity): ActivityTaskData {
	let activity = { ..._activity };
	let data: Prisma.JsonObject = {};
	for (const [key, value] of Object.entries(activity.data as Prisma.JsonObject)) {
		const compressedMapping = ACTIVITY_DATA_COMPRESSION_MAPPINGS.find(m => m.to === key);
		if (!compressedMapping) {
			data[key] = value;
		} else {
			data[compressedMapping.from] = value;
		}
	}
	return {
		...data,
		type: activity.type as activity_type_enum,
		userID: activity.user_id.toString(),
		channelID: activity.channel_id.toString(),
		duration: activity.duration,
		finishDate: activity.finish_date.getTime(),
		id: activity.id
	};
}

let sqlStr = `BEGIN;
`;
for (const { from, to } of ACTIVITY_DATA_COMPRESSION_MAPPINGS) {
	sqlStr += `UPDATE activity SET data = (data::jsonb - '${from}' || jsonb_build_object('${to}', data->>'${from}'))::json WHERE data::jsonb ? '${from}';\n`;
}
sqlStr += '\nCOMMIT;\n';
console.log(sqlStr);

export function convertFlatActivityToStoredActivity(rawData: Partial<ActivityTaskOptions>): Prisma.InputJsonObject {
	let data: Record<string, number | string> = { ...rawData };
	delete data.type;
	delete data.userID;
	delete data.id;
	delete data.channelID;
	delete data.duration;

	for (const [key, value] of objectEntries(data)) {
		const compressedMapping = ACTIVITY_DATA_COMPRESSION_MAPPINGS.find(m => m.from === key);
		if (compressedMapping) {
			delete data[key];
			data[compressedMapping.to] = value;
		}
	}

	return data;
}

/**
 * ⚠️ Uses queryRawUnsafe
 */
export async function countUsersWithItemInCl(itemID: number, ironmenOnly: boolean) {
	const query = `SELECT COUNT(id)
				   FROM users
				   WHERE ("collectionLogBank"->>'${itemID}') IS NOT NULL 
				   AND ("collectionLogBank"->>'${itemID}')::int >= 1
				   ${ironmenOnly ? 'AND "minion.ironman" = true' : ''};`;
	const result = parseInt(((await prisma.$queryRawUnsafe(query)) as any)[0].count);
	if (isNaN(result)) {
		throw new Error(`countUsersWithItemInCl produced invalid number '${result}' for ${itemID}`);
	}
	return result;
}

export async function addToGPTaxBalance(userID: string | string, amount: number) {
	await Promise.all([
		prisma.clientStorage.update({
			where: {
				id: CLIENT_ID
			},
			data: {
				gp_tax_balance: {
					increment: amount
				}
			}
		}),
		prisma.user.update({
			where: {
				id: userID.toString()
			},
			data: {
				total_gp_traded: {
					increment: amount
				}
			}
		})
	]);
}
