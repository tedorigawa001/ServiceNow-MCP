# EF-01：純粋ConstructionShell・固定resource状態・別one-shot binding

Date: 2026-10-31。対象：[詳細設計§12](BEST_PRACTICE_ABORT_SCOPE_EARLY_DIAGNOSTIC_FRIEND_SEPARATION_DESIGN.md)。純粋な合成issuer試験であり、実session／constructor／OSには未接続。

## 1 実装範囲

[開発専用module](../src/review/abort-scope-evidence-construction-shell.ts)のprivate creatorが、pending shell・固定purpose3個・resource10slot・first reason／refusal・core／sourceの別claim・非実行commit／seal状態を扱う。唯一のexportは固定case名runner。外部からsession／binding／callback／token／resourceを供給する口や、writer／登録portはない。

CoreBindingは同合成creatorのrun／session／snapshot／core／lease／登録owner参照、SourceBindingはそのCoreBindingとkey／source／handle参照に結合する。copy・外国参照は拒否し、自分のclaimを戻さず、外国shellを変更しない。これは合成参照graphであり、実core／実認証snapshotを観測した証明ではない。

resourceはattempt、受領済みheld、取得不明unknownを区別する。attempts／acquisitions／releasesは各0／1。非実行commitは所有者ラベルをshellからsessionへ一度移す。誤った旧ownerの解放申告は拒否するが、必要な新owner側の解放記録は引き続き可能。停止中に受領したhandleも後始末用に記録でき、初期化は再開しない。

sealは実解除を行わず、未解決slotをunconfirmedに固定するだけ。unknownからconfirmedへの昇格を拒否し、first reasonをcleanupの都合で上書きしない。全7permissionは常にfalse、出力は再帰freezeした診断copyだけ。

## 2 テスト先行とレビュー修正

- 最初の1テストはmodule未実装でRED、pure pending shell実装後にGREEN。
- core→非実行commit→sourceの別claimと所有者移譲を追加。未知resourceと誤ownerの解放条件も、未対応caseのREDからGREENを確認した。
- 固定の独立期待値で、binding順序／copy／外国参照／二重利用／先行取消／部分取得／seal／秘密非出力を拡充した。core未結合のtimer試行を拒否する境界も追加した。
- 専用52件・全体214ファイル9,575件が一度成功した後、自己レビューで「core解放済みでもcommit／source bindingへ進める」点を発見。合成の解放→commit／解放→source bindingを実行する1テストで、refusalが記録されないREDを再現した。
- 原因はhistorical core bindingとlive resource状態を結び付けていなかったこと。snapshot／core／登録owner／source継続の解放でbindingを即時inactiveにし、同参照を再利用できないよう修正。専用53件でGREENとなった。

## 3 受入条件と独立検証

[合成テスト](../tests/review/construction-shell.test.ts)53件。期待値はテスト側の固定code／slot数／状態／操作数上限に記載し、製品側case一覧や判定関数を使って生成しない。

- pendingのまま外部観測0、purpose3個は未観測、resource10slotを確認。Date.now／performance.now／setTimeout／fetch／AbortControllerを呼ばない。
- core／source／commitのcountは各最大1、失敗後はclaim復元0。run／session／snapshot／core／lease／登録owner、およびsource側key／source／handleの外国参照・コピーを拒否。
- snapshot／core／登録ownerが揃わないcore binding、commit前のsource binding、core結合前timer、停止後の取得／再bindingを拒否。
- 旧ownerによる解放の拒否後も、新ownerの正当な解放記録を一度だけ受け付ける。unknown／未解放のsealを解除成功と報告しない。解放済みcoreへのcommit／source bindingを拒否。
- first reasonとfirst refusalを別々に保持。seal後のlate操作7種と二重sealは不変のcopyを保つ。任意の外部diagnosticを再入力しても受理しない。
- proxy／accessor／余剰field／symbol／未知caseを、getterやtrapを実行せず拒否。秘密markerやlive object参照を出力しない。

## 4 最終検証

- `bdo npm run build`：成功。
- `bdo npm test -- tests/review/construction-shell.test.ts`：53件成功。
- `bdo node tests/review/package-http-classification.mjs`：[compiled fixture](../tests/review/fixtures/compiled-construction-shell.mjs)と既存status各段階が成功。offline・ignore-scriptsのpack dry-runは409ファイル。新module／fixtureの非同梱、配布runtimeから新moduleへの参照なしを確認。
- `bdo npm test`最終再実行：214ファイル・9,576テスト成功、未処理拒否なし（27.01秒）。変更source／test／compiled fixture／梱包scriptのESLintは警告・エラー0。依存再取得を伴うworker梱包試験は行っていない。

## 5 レビュー修正（2026-10-31）

- 指摘：`release()`の正当な申告者を`owner === 'session'`だけで決めていたため、owner=none（未開始・解放済み）のslotは、commit後も旧owner（run）だけが申告できた。commit後に新ownerが未開始`phase_timer`を申告すると`evidence_binding_mismatch`でshellが停止し、旧ownerの申告は`not_needed`で通った。新ownerによる解放済み`core`の再申告も、重複（`invalid_state`）ではなく外国owner扱いになっていた。fixtureの後始末がheldだけを解放するため、既存試験では未到達だった。
- 修正：owner=noneのslotは、commit後なら新owner、commit前なら旧ownerを正当な申告者とする。
- 試験：commit後の新owner未開始申告（`not_needed`・refusalなし・teardown confirmed）、旧owner未開始申告の拒否、新owner再解放の`invalid_state`を固定case 3件・テスト2件で追加（専用55件）。
- mutation：判定を元に戻すと追加2件が失敗し、復元後に成功。
- 再検証：build成功、全体214ファイル・9,578テスト成功・未処理拒否なし。梱包検査は409ファイルで成功、変更ファイルのESLintは0件。設計をdraft-0.4へ更新し、親設計2件のリンクも更新した。§4の数値は修正前の記録として残す。

## 6 未接続・保証しないこと

実constructorのfield初期化順は未変更。純粋modelのslotを実際のOS取得／解除の証拠にしない。EF-02のrollback section／callback相互停止／失敗copyの搬送・一度限りtake／admission返却・credential参照破棄は未実装で、unknownな実resourceを解放できたとは主張しない。

EF-03のfake friend・synthetic_io・private probeの撤去、ビルドroot分離、本番bindingも未実施。今回の非同梱試験の成功を、既存配布friend撤去済みと読み替えない。確保量やRust work上界も未導出。

正式発行口閉鎖・Unknown・全体受付無効・VM／監視／telemetry調査保留を維持する。実接続・実通信・実機操作・設定変更・Pushは行っていない。
