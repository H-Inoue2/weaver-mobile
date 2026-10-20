// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.
// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).

// K-120（「通知を受け取れません」警告を表示の入口で止める）: 小関数 observeDisplayedPushProxyStatus の単体テスト（K120-UT-03a〜03n）。
// 期待結果の正は K120_詳細設計.md §2.2（IF）・§8.1（入力×境界）、K120_単体テスト設計.md §1.1。
// mock なし。各テストの中で require する（未実装でも1件ずつ失敗する）。

import {NEVER, Observable, of, Subject, throwError} from 'rxjs';

type Mod = {
    SHOW_PUSH_PROXY_WARNING: boolean;
    observeDisplayedPushProxyStatus: (status$: Observable<string>, show?: boolean) => Observable<string>;
};
const load = (): Mod => require('../push_proxy_warning');

// 小関数の戻り値を購読して、受信値・完了・エラーを記録する
const watch = (out$: Observable<string>) => {
    const rec = {values: [] as string[], completed: false, errors: [] as unknown[]};
    const sub = out$.subscribe({
        next: (v) => rec.values.push(v),
        error: (e) => rec.errors.push(e),
        complete: () => {
            rec.completed = true;
        },
    });
    return {rec, sub};
};

describe('K-120 小関数 observeDisplayedPushProxyStatus（show=false は verified、show=true は素通し）', () => {
    it('K120-UT-03a show=false／of(not_available): 購読が戻る前に [verified] が同期で出て、完了する', () => {
        const {observeDisplayedPushProxyStatus} = load();
        const {rec} = watch(observeDisplayedPushProxyStatus(of('not_available'), false));
        expect(rec.values).toEqual(['verified']);
        expect(rec.completed).toBe(true);
    });

    it.each([
        ['unknown'],
        ['verified'],
    ])('K120-UT-03b show=false／of(%s): [verified]', (status) => {
        const {observeDisplayedPushProxyStatus} = load();
        const {rec} = watch(observeDisplayedPushProxyStatus(of(status), false));
        expect(rec.values).toEqual(['verified']);
    });

    it.each([
        ['foo'],
        [''],
    ])('K120-UT-03c show=false／想定外の値 "%s": [verified]', (status) => {
        const {observeDisplayedPushProxyStatus} = load();
        const {rec} = watch(observeDisplayedPushProxyStatus(of(status), false));
        expect(rec.values).toEqual(['verified']);
    });

    it('K120-UT-03d show=false／何も流さない（NEVER）: [verified] で完了する', () => {
        const {observeDisplayedPushProxyStatus} = load();
        const {rec} = watch(observeDisplayedPushProxyStatus(NEVER as Observable<string>, false));
        expect(rec.values).toEqual(['verified']);
        expect(rec.completed).toBe(true);
    });

    it('K120-UT-03e show=false／エラーを流す: [verified] で完了し、error コールバックは0回', () => {
        const {observeDisplayedPushProxyStatus} = load();
        const {rec} = watch(observeDisplayedPushProxyStatus(throwError(() => new Error('x')), false));
        expect(rec.values).toEqual(['verified']);
        expect(rec.completed).toBe(true);
        expect(rec.errors).toHaveLength(0);
    });

    it('K120-UT-03f show=false: 元の Observable を購読しない（購読回数0）。戻り値は status$ と別参照', () => {
        const {observeDisplayedPushProxyStatus} = load();
        let subscribed = 0;
        const status$ = new Observable<string>((subscriber) => {
            subscribed++;
            subscriber.next('not_available');
        });
        const out$ = observeDisplayedPushProxyStatus(status$, false);
        const {rec} = watch(out$);
        expect(rec.values).toEqual(['verified']);
        expect(subscribed).toBe(0);
        expect(out$).not.toBe(status$);
    });

    it.each([
        ['verified'],
        ['not_available'],
        ['unknown'],
    ])('K120-UT-03g show=true／of(%s): そのまま [%s]', (status) => {
        const {observeDisplayedPushProxyStatus} = load();
        const {rec} = watch(observeDisplayedPushProxyStatus(of(status), true));
        expect(rec.values).toEqual([status]);
    });

    it('K120-UT-03h show=true: 戻り値は status$ と同一参照（pipe で包まない）', () => {
        const {observeDisplayedPushProxyStatus} = load();
        const status$ = of('x');
        expect(observeDisplayedPushProxyStatus(status$, true)).toBe(status$);
    });

    it.each([
        ['foo'],
        [''],
    ])('K120-UT-03i show=true／想定外の値 "%s": そのまま素通し', (status) => {
        const {observeDisplayedPushProxyStatus} = load();
        const {rec} = watch(observeDisplayedPushProxyStatus(of(status), true));
        expect(rec.values).toEqual([status]);
    });

    it('K120-UT-03j show=true／NEVER: 受信値 []・完了なし（verified を補わない）', () => {
        const {observeDisplayedPushProxyStatus} = load();
        const {rec} = watch(observeDisplayedPushProxyStatus(NEVER as Observable<string>, true));
        expect(rec.values).toEqual([]);
        expect(rec.completed).toBe(false);
    });

    it('K120-UT-03k show=true／エラー: error コールバックが1回、同じ Error オブジェクトで呼ばれる。受信値 []', () => {
        const {observeDisplayedPushProxyStatus} = load();
        const e = new Error('boom');
        const {rec} = watch(observeDisplayedPushProxyStatus(throwError(() => e), true));
        expect(rec.errors).toHaveLength(1);
        expect(rec.errors[0]).toBe(e);
        expect(rec.values).toEqual([]);
    });

    it('K120-UT-03l show=true／Subject: next の直後に同期で順序どおり届き、購読解除で購読が残らない', () => {
        const {observeDisplayedPushProxyStatus} = load();
        const subject = new Subject<string>();
        const {rec, sub} = watch(observeDisplayedPushProxyStatus(subject, true));
        expect(subject.observed).toBe(true);
        subject.next('unknown');
        expect(rec.values).toEqual(['unknown']);
        subject.next('not_available');
        expect(rec.values).toEqual(['unknown', 'not_available']);
        subject.next('verified');
        expect(rec.values).toEqual(['unknown', 'not_available', 'verified']);
        sub.unsubscribe();
        expect(subject.observed).toBe(false);
    });

    it('K120-UT-03m show 省略／of(not_available): 既定値（SHOW_PUSH_PROXY_WARNING=false）と同じ [verified]', () => {
        const {observeDisplayedPushProxyStatus} = load();
        const {rec} = watch(observeDisplayedPushProxyStatus(of('not_available')));
        expect(rec.values).toEqual(['verified']);
    });

    it('K120-UT-03n 定数は boolean の false。export は SHOW_PUSH_PROXY_WARNING と observeDisplayedPushProxyStatus のちょうど2つ（default なし）', () => {
        const mod = load();
        expect(mod.SHOW_PUSH_PROXY_WARNING).toBe(false);
        expect(Object.keys(mod).sort()).toEqual(['SHOW_PUSH_PROXY_WARNING', 'observeDisplayedPushProxyStatus']);
    });
});
