import { Time } from 'e';

import { convertFlatActivityToStoredActivity, convertStoredActivityToFlatActivity } from '../src/lib/settings/prisma';

const exampleTaskData: any = {
	logID: 1,
	userID: '123',
	channelID: '123',
	quantity: 1,
	powerchopping: true,
	duration: Time.Hour,
	fakeDurationMin: Time.Hour,
	fakeDurationMax: Time.Hour,
	type: 'Woodcutting'
};

describe('Task Data Conversion', () => {
	test('Task Data Compression', () => {
		expect(convertFlatActivityToStoredActivity(exampleTaskData)).toEqual({
			fakeDurationMax: 3_600_000,
			fakeDurationMin: 3_600_000,
			logID: 1,
			powerchopping: true,
			q: 1
		});
	});
	test('Task Data Decompression', () => {
		const baseActivity = {
			id: 1,
			user_id: '',
			start_date: new Date(),
			completed: true,
			channel_id: '',
			finish_date: new Date()
		};
		const compressed = convertFlatActivityToStoredActivity(exampleTaskData) as any;
		const converted: any = convertStoredActivityToFlatActivity({
			...baseActivity,
			data: compressed
		} as any);

		expect(converted.quantity).toEqual(compressed.q);
	});
});
