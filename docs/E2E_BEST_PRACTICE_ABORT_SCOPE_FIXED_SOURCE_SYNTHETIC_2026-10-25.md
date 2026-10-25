# AU-BR-006 固定source issuer基礎の合成検証

Date: 2026-10-25。対象は[固定source設計§10](BEST_PRACTICE_ABORT_SCOPE_FIXED_SOURCE_ISSUER_DESIGN.md#10-合成issuerの限定実装)。実session/transport/Worker/PDIのE2Eではない。

## 実装範囲

- factory内のprivate WeakMapで合成session/source/ReleasePermit/issuer/read/observationのidentityを保持する。
- 生成claimはsession/sourceで一度限り。後続検査より前にsession側を消費し、失敗理由も保持する。同sessionの別source/修正permitでも再生成しない。
- 固定GET descriptorだけを生成し、query/fields/method/limit/offset等を任意入力にしない。tableは最大8名、phase/票の順序・一度限りの完了を検査する。
- boundedな合成JSONを必要5列へ射影し、欠落/曖昧/不正scopeをUnknownへ正規化する。余分な列・raw body・秘密markerを出力しない。
- identity混入、401/403、時刻不整合、frame不正、cleanup未確認は停止。source/session/issuer終了後のreceiptを受理しない。

## 実行結果

| 検証 | 結果 |
|---|---|
| 固定source・stream・予約・channel・比較接続・phase・owner・比較器の関連8ファイル | 371 tests成功（固定source74、既存関連297） |
| `bdo npm run build` | 成功 |
| 新規source/testへの`bdo npx eslint` | 問題なし |
| `npm pack --dry-run --json --ignore-scripts`の一覧検査（一時cacheを当該processだけに指定） | 369 files、`dist/review/abort-scope-evidence*`は0件 |
| `bdo npx vitest run`（全体、未完了初回の終端化・final skip追加後） | 143 files / 4154 tests成功 |
| `npm run test:pack`（一時cacheを当該processだけに指定） | 本番依存だけのinstall＋worker smoke成功、369 files |

実行：`bdo npx vitest run tests/review/abort-scope-evidence-fixed-source.test.ts tests/review/abort-scope-evidence-stream.test.ts tests/review/abort-scope-evidence-reservations.test.ts tests/review/abort-scope-evidence-channel.test.ts tests/review/abort-scope-evidence-comparison-owner.test.ts tests/review/abort-scope-evidence-phases.test.ts tests/review/abort-scope-evidence-owner.test.ts tests/review/abort-scope-evidence.test.ts`。

二重生成・同session別source、別permit/clone/別factory/別session、親/metadata不足/非matched/final後、失敗後に修正した生成条件を拒否した。ready/release fixtureの後変更が内部状態を書き換えないこと、source終了後の再生成拒否も確認した。

固定GET全パラメーター、禁止name/global、0/1/2/3件、scope欠落/null/表示名/参照object/正当な参照ID、版列欠落、table混入、不正JSONを試験した。初回/最終順序・二重完了・別票・時刻境界/逆転、cleanup未知、clone不可frame、frame getterからの再入終了でも停止する。fetch/clock/timer/console.logを禁止した純粋操作も成功した。通常phase閉鎖時に未完了の初回GETを`not_collected`で終端化して後からの完了を拒否すること、閉鎖時刻なしでは停止すること、初回unavailableのtableをfinal GETなしで`not_collected`としてskipして次tableのfinalへ進めること、初回取得済みtableのskip・初回不足tableへの再読・区間外/初回より前の時刻を拒否することも確認した。

初回単体試験は61成功/1失敗。0件配列をit.eachへ直接渡したため引数展開でundefinedになったことが原因だった。0/2/3件の3ケースをobject wrapperで渡す形へ修正し、意図した配列が入力される状態で再確認した。製品の正規化条件や期限を緩めていない。

## 制限・未実施

合成factoryは誰でも生成でき、ready/release/時刻/cleanupをfixtureとして供給する。実BoundedReadSession/ReleasePermit/ACL/認証の証明ではない。source/selected metadata/payload/worker planの実受領物、同じC/G/E/R/時計、stream/retry/最終seal・上位JSONへの接続は未実施。

8名上限や16KiB frame境界は合成モデルの検査であり、HTTP受信capの発動を検証したものではない。viewは合成用の繰返し読取で、jobごとのone-shot配送/本番completionを発行しない。初回/最終GETは送信せず、親/metadata再読・cache配送・実解放も未接続。

公開0.2/0.3・明示14/既定3規則・固定評価セット・実source/transportの許可先に変更なし。VM/監視/telemetry保留・Unknown・全体受付無効を維持し、実機操作・トークン発行・設定変更・本番cap/実行permit発行は行っていない。
