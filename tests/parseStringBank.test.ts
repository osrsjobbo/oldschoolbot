/* eslint-disable @typescript-eslint/no-unused-vars */
import { randInt } from 'e';
import { Bank, Items } from 'oldschooljs';
import { describe, expect, test } from 'vitest';

import getOSItem from '../src/lib/util/getOSItem';
import itemID from '../src/lib/util/itemID';
import { parseBank, parseInputCostBank, parseQuantityAndItem, parseStringBank } from '../src/lib/util/parseStringBank';

const psb = parseStringBank;
const get = getOSItem;
const pQI = parseQuantityAndItem;

describe('Bank Parsers', () => {
	test('parseStringBank', async () => {
		const output = psb(` 1x twisted bow, coal,  5k egg,  1b trout, 5 ${itemID('Feather')} `);
		const expected = [
			[get('Twisted bow'), 1],
			[get('Coal'), 0],
			[get('Egg'), 5000],
			[get('Trout'), 1_000_000_000],
			[get('Feather'), 5]
		];

		expect(expected).toEqual(expect.arrayContaining(output));
		expect(output.length).toEqual(expected.length);
		for (let i = 0; i < output.length; i++) {
			let [resItem, resQty] = output[i];
			let [expItem, expQty] = expected[i];
			expect(resItem).toEqual(expItem);
			expect(resQty).toEqual(expQty);
		}

		expect(psb('')).toEqual([]);
		expect(psb(' ')).toEqual([]);
		expect(psb(', ')).toEqual([]);
		expect(psb(',, , , , ,, , , , ,')).toEqual([]);
		expect(psb('twisted bow, twisted bow, 1000 twisted bow, 5k twisted bow')).toEqual([[get('Twisted bow'), 0]]);

		expect(psb('-1 twisted bow')).toEqual([[get('Twisted bow'), 0]]);

		expect(psb('1k twisted bow, twisted bow, 1000x twisted bow, 5k twisted bow')).toEqual([
			[get('Twisted bow'), 1000]
		]);
		expect(psb('5 tarromin')).toEqual([[get('Tarromin'), 5]]);
		expect(psb('3rd age platebody, 5 3rd age platelegs')).toEqual([
			[get('3rd age platebody'), 0],
			[get('3rd age platelegs'), 5]
		]);
		expect(psb('Bronze arrow, Iron arrow, Steel arrow, Rune arrow').filter(i => i[0].tradeable_on_ge)).toEqual([
			[get('Bronze arrow'), 0],
			[get('Iron arrow'), 0],
			[get('Steel arrow'), 0],
			[get('Rune arrow'), 0]
		]);
		expect(
			psb('Steel platelegs, Adamant platelegs,Non-existent item!!, Black platelegs').filter(
				i => i[0].tradeable_on_ge
			)
		).toEqual([
			[get('Steel platelegs'), 0],
			[get('Adamant platelegs'), 0],
			[get('Black platelegs'), 0]
		]);
	});

	test('parseBank - flags', async () => {
		const bank = new Bank().add('Steel arrow').add('Bones').add('Coal').add('Clue scroll (easy)');
		const res = parseBank({
			inputBank: bank,
			flags: { equippables: '' }
		});
		expect(res.length).toEqual(1);

		const res2 = parseBank({
			inputBank: bank,
			flags: { tradeables: '' }
		});
		expect(res2.length).toEqual(3);

		const res3 = parseBank({
			inputBank: bank,
			flags: { untradeables: '' }
		});
		expect(res3.length).toEqual(1);
	});

	test('parseBank - filters', async () => {
		const bank = new Bank().add('Steel arrow').add('Bones').add('Coal').add('Clue scroll (easy)');
		const res = parseBank({
			inputBank: bank,
			flags: { tt: '' }
		});
		expect(res.length).toEqual(1);
		expect(res.amount('Clue scroll (easy)')).toEqual(1);
	});

	test('parseBank - search', async () => {
		const bank = new Bank()
			.add('Steel arrow')
			.add('Bones')
			.add('Coal')
			.add('Clue scroll (easy)')
			.add('Rune arrow')
			.add('Mind rune', 50)
			.add('Rune platebody');
		const res = parseBank({
			inputBank: bank,
			flags: { search: 'rune' }
		});
		expect(res.length).toEqual(3);
		expect(res.amount('Mind rune')).toEqual(50);
		expect(res.amount('Rune platebody')).toEqual(1);
		expect(res.amount('Rune arrow')).toEqual(1);
	});

	test('parseBank - inputStr', async () => {
		const bank = new Bank()
			.add('Steel arrow')
			.add('Bones', 2)
			.add('Coal', 6)
			.add('Clue scroll (easy)')
			.add('Rune arrow')
			.add('Mind rune', 50)
			.add('Rune platebody');
		const res = parseBank({
			inputBank: bank,
			flags: {},
			inputStr: 'coal'
		});
		expect(res.length).toEqual(1);
		expect(res.amount('Coal')).toEqual(6);

		const res2 = parseBank({
			inputBank: bank,
			flags: {},
			inputStr: 'coal, bones'
		});
		expect(res2.length).toEqual(2);
		expect(res2.amount('Coal')).toEqual(6);
		expect(res2.amount('Bones')).toEqual(2);
	});

	test('parseBank - other', async () => {
		const bank = new Bank()
			.add('Steel arrow')
			.add('Bones', 2)
			.add('Coal', 6)
			.add('Clue scroll (easy)')
			.add('Rune arrow')
			.add('Mind rune', 50)
			.add('Rune platebody');
		const res = parseBank({
			inputBank: bank,
			flags: {},
			inputStr: '500 coal'
		});
		expect(res.length).toEqual(1);
		expect(res.amount('Coal')).toEqual(6);
	});

	test('parseBank - same item names', async () => {
		const bank = new Bank().add(22_002);
		const res = parseBank({
			inputBank: bank,
			flags: {},
			inputStr: 'dragonfire ward'
		});
		expect(res.length).toEqual(1);
		expect(res.amount(22_002)).toEqual(1);
	});

	test('parseBank - extra number', async () => {
		const bank = new Bank().add('Coal', 5).add('3rd age platebody', 100).add('Egg', 3);
		const res = parseBank({
			inputBank: bank,
			flags: {},
			inputStr: `1 5 coal, 3 100 3rd age platebody,${get('Egg').id}`
		});
		expect(res.length).toEqual(3);
		expect(res.amount('Coal')).toEqual(1);
		expect(res.amount('3rd age platebody')).toEqual(3);
		expect(res.amount('Egg')).toEqual(3);

		const other = parseBank({ inputBank: bank, inputStr: get('Egg').id.toString() });
		expect(other.amount('Egg')).toEqual(3);
	});

	test('parseBank - look for nonexistent items', async () => {
		const bank = new Bank().add('Steel arrow').add('Bones').add('Coal', 500).add('Clue scroll (easy)');
		expect(parseBank({ inputBank: bank, inputStr: '1 Portrait' }).toString()).toEqual('No items');
		expect(parseBank({ inputBank: bank, inputStr: '1 666' }).toString()).toEqual('No items');
		expect(parseBank({ inputBank: bank, inputStr: '526' }).toString()).toEqual('1x Bones');
		expect(parseBank({ inputBank: bank, inputStr: '0 cOaL' }).toString()).toEqual('500x Coal');
	});

	test('parseBank - check item aliases', async () => {
		const bank = new Bank().add('Arceuus graceful top', 30).add('Bones');
		expect(parseBank({ inputBank: bank, inputStr: 'pUrPle gRaceful top' }).toString()).toEqual(
			'30x Arceuus graceful top'
		);
	});

	test('parseBank - max size', async () => {
		const bank = new Bank().add('Arceuus graceful top', 30).add('Bones');
		for (let i = 0; i < 500; i++) bank.add(Items.random().id, randInt(1, 20));
		expect(parseBank({ inputBank: bank, flags: { all: 'all' }, maxSize: 23 }).length).toEqual(23);
	});

	test('parseBank - with no inputBank', async () => {
		expect(parseBank({ inputBank: undefined, inputStr: '100 trout, 100 twisted bow' }).bank).toEqual(
			new Bank().add('Trout', 100).add('Twisted bow', 100).bank
		);
	});

	test('parseQuantityAndItem', () => {
		expect(pQI('')).toEqual([]);
		expect(pQI(' ,,, ')).toEqual([]);
		expect(pQI('1.5k twisted bow')).toEqual([[get('Twisted bow')], 1500]);
		expect(pQI('1m twisted bow')).toEqual([[get('Twisted bow')], 1_000_000]);
		expect(pQI('20 twisted bow')).toEqual([[get('Twisted bow')], 20]);
		expect(pQI('0 twisted bow')).toEqual([[get('Twisted bow')], 0]);
		expect(pQI('twisted bow')).toEqual([[get('Twisted bow')], 0]);
		expect(pQI('1 1 twisted bow')).toEqual([[get('Twisted bow')], 1]);
		const runePlate = get('Rune platebody')!;
		expect(pQI(`1 100 ${runePlate.id}`)).toEqual([[runePlate], 1]);
		expect(pQI(`${runePlate.id}`)).toEqual([[runePlate], 0]);
		expect(pQI('1 1 Dragonfire ward')).toEqual([[get(22_002)], 1]);

		// Expressions
		expect(pQI('10+10 twisted bow')).toEqual([[get('Twisted bow')], 20]);
		expect(pQI('1.5k*1 twisted bow')).toEqual([[get('Twisted bow')], 1500]);
		expect(pQI('10*10 twisted bow')).toEqual([[get('Twisted bow')], 100]);
		expect(pQI('10*10 twisted bow')).toEqual([[get('Twisted bow')], 100]);
		expect(pQI('10*10 twisted bow')).toEqual([[get('Twisted bow')], 100]);
		expect(pQI('#-1 twisted bow', new Bank().add('Twisted bow', 100))).toEqual([[get('Twisted bow')], 99]);
		expect(pQI('#/2 twisted bow', new Bank().add('Twisted bow', 100))).toEqual([[get('Twisted bow')], 50]);
		expect(pQI('#-1 twisted bow', new Bank().add('Twisted bow', 100))).toEqual([[get('Twisted bow')], 99]);
		expect(pQI('#-1 3rd age platebody', new Bank().add('3rd age platebody', 100))).toEqual([
			[get('3rd age platebody')],
			99
		]);
		expect(pQI('(#/2)+5 3rd age platebody', new Bank().add('3rd age platebody', 100))).toEqual([
			[get('3rd age platebody')],
			55
		]);

		const testBank = new Bank().add('Feather', 100_000_000_000);
		expect(pQI('1b*2 twisted bow', testBank)).toEqual([[get('Twisted bow')], 2_000_000_000]);
		expect(pQI('1m*10 twisted bow', testBank)).toEqual([[get('Twisted bow')], 10_000_000]);
		expect(pQI('1k*10 twisted bow', testBank)).toEqual([[get('Twisted bow')], 10_000]);
		expect(pQI('0.5b*2 twisted bow', testBank)).toEqual([[get('Twisted bow')], 1_000_000_000]);
		expect(pQI('1.5m*10 twisted bow', testBank)).toEqual([[get('Twisted bow')], 10_000_000 * 1.5]);
		expect(pQI('1.5k*10 twisted bow', testBank)).toEqual([[get('Twisted bow')], 10_000 * 1.5]);
	});

	test('parseInputCostBank', () => {
		const usersBank = new Bank()
			.add('Coal', 100)
			.add('Egg', 3)
			.add('Feather', 600)
			.add('Twisted bow', 6)
			.add('Shark', 1)
			.add('Rune sword')
			.add('Fire cape');

		//
		const result = parseInputCostBank({ usersBank, inputStr: undefined, flags: {}, excludeItems: [] });
		expect(result.length).toEqual(0);

		//
		const result2 = parseInputCostBank({ usersBank, inputStr: undefined, flags: { all: 'all' }, excludeItems: [] });
		expect(result2.length).toEqual(usersBank.length);

		//
		const result3 = parseInputCostBank({
			usersBank,
			inputStr: '1+1 egg, 5 feather, 1 manta ray',
			flags: {},
			excludeItems: []
		});
		expect(result3.length).toEqual(2);
		expect(result3.bank).toStrictEqual(new Bank().add('Egg', 2).add('Feather', 5).bank);

		//
		const result4 = parseInputCostBank({
			usersBank,
			inputStr: '#-1 egg, # feather, # manta ray, -1 watermelon, 0 fire rune, #*5 soul rune',
			flags: {},
			excludeItems: []
		});
		expect(result4.length).toEqual(2);
		expect(result4.bank).toStrictEqual(new Bank().add('Egg', 2).add('Feather', 600).bank);

		//
		const result5 = parseInputCostBank({
			usersBank,
			inputStr: `#-1 ${itemID('Egg')}, 1 ${itemID('Feather')}`,
			flags: {},
			excludeItems: []
		});
		expect(result5.bank).toStrictEqual(new Bank().add('Egg', 2).add('Feather', 1).bank);
		expect(result5.length).toEqual(2);

		//
		const result6 = parseInputCostBank({
			usersBank,
			inputStr: '1 Shark',
			flags: { untradeables: 'untradeables' },
			excludeItems: []
		});
		expect(result6.bank).toStrictEqual(new Bank().bank);
		expect(result6.length).toEqual(0);

		//
		const result7 = parseInputCostBank({
			usersBank,
			inputStr: '1 Shark, 5 Fire cape',
			flags: { untradeables: 'untradeables' },
			excludeItems: []
		});
		expect(result7.bank).toStrictEqual(new Bank().add('Fire cape').bank);
		expect(result7.length).toEqual(1);

		//
		const result8 = parseInputCostBank({
			usersBank,
			inputStr: '1 Shark, 5 Fire cape',
			flags: { equippables: 'equippables' },
			excludeItems: []
		});
		expect(result8.bank).toStrictEqual(new Bank().add('Fire cape').bank);
		expect(result8.length).toEqual(1);

		//
		const result9 = parseInputCostBank({
			usersBank,
			inputStr: undefined,
			flags: { equippables: 'equippables' },
			excludeItems: []
		});
		expect(result9.bank).toStrictEqual(new Bank().add('Fire cape').add('Rune sword').add('Twisted bow', 6).bank);
		expect(result9.length).toEqual(3);

		//
		const result10 = parseInputCostBank({
			usersBank,
			inputStr: undefined,
			flags: { equippables: 'equippables', qty: '1' },
			excludeItems: []
		});
		expect(result10.bank).toStrictEqual(new Bank().add('Fire cape').add('Rune sword').add('Twisted bow').bank);
		expect(result10.length).toEqual(3);

		//
		const result11 = parseInputCostBank({
			usersBank,
			inputStr: 'egg, feather',
			flags: {},
			excludeItems: []
		});
		expect(result11.bank).toStrictEqual(new Bank().add('Feather', 600).add('Egg', 3).bank);
		expect(result11.length).toEqual(2);

		if (
			[result, result2, result3, result4, result5, result6, result7, result8, result9, result10].some(
				b => b.has('Cannonball') || b.has('Toolkit') || b.has(11_525)
			)
		) {
			throw new Error('Result had a cannonball/toolkit');
		}
	});
});
