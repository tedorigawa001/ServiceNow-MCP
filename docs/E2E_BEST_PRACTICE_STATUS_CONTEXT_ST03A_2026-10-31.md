# AU-BR-006 ST-03A：private context／anchor／発行claimの合成検証

Date: 2026-10-31 / Scope: ローカルの閉鎖合成fixtureだけ。native操作／実通信／実session E2Eではない。

## 1 実装範囲

[接続詳細設計§10](BEST_PRACTICE_ABORT_SCOPE_STATUS_TERMINAL_CONNECTION_DESIGN.md)の内部契約を実装した。同private constructorがowner・local世代・readonly budget／固定clock・元windowとcontextを作り、同じclosureでanchor・合成record・一度限り発行claim・診断を保持する。各生成claimはcallback前にstarted、終了後はspentで戻さない。

外部exportは固定scenario名だけを受ける開発専用fixture。context／record／診断／session／callback／consumer／registryの提出・登録口はない。private非実行draftは外に返さず、consumerはslot予約だけで未実装。返却はfreezeした限定診断で、全7権限=false。

ST-01／ST-02・実session・runtimeの台帳／生成口は変更しない。recordは固定presetの合成事実で、native header／cleanupを受領した証拠ではない。

## 2 実行結果

| 確認 | 結果 |
|---|---|
| `bdo npm run build` | 成功 |
| 関連8ファイルのVitest（下記） | 3,319件成功。新規status-contextは64件 |
| `bdo npx eslint src/review/abort-scope-evidence-status-context.ts tests/review/status-context.test.ts` | 指摘なし |
| `bdo node tests/review/package-http-classification.mjs` | 409ファイルdry-run成功。新moduleのJS／map／型宣言・fixtureは非同梱、packaged runtimeから依存なし |
| compiled単独fixture | native／fetch／timerを禁止したimportと実行、同constructor内部claim・混入拒否・非実行draftの非露出・全権限falseを確認 |

関連8ファイル：`tests/review/status-context.test.ts`、`status-cleanup.test.ts`、`status-terminal.test.ts`、`http-classification.test.ts`、`http-classification-legacy.test.ts`、`native-reader-adapter.test.ts`、`native-body-bootstrap.test.ts`、`native-ownership-contract.test.ts`（全てtests/review配下）。全体テスト一式は今回再実行していない。

## 3 確認した境界

- 製品のscenario一覧・適格性helperをimportしない33ケースの期待表を照合し、件数・名前の一意性を確認した。独立とは計算・期待表の非共有であり、人の独立ブラインド評価ではない。
- context／anchor／record／local世代／budget／clock／windowが別ownerのものなら拒否し、foreign ownerのclaim・診断を変更しない。record copy、外部診断、JSON復元診断も拒否。
- context／anchor／record／発行の重複生成・clock callbackでの発行再入・取消・失敗後の再発行を拒否。各生成数は1以下、発行claimも1回まで。
- HTTPとcleanupはimmutableな合成事実として保持。hard401＋cleanup拒否、local parent404、read開始違反、未確認cleanup、期限切れ・時計逆行／throwでも先行診断を失わない。read開始違反はrefusalから停止し、confirmed事実を偽装しない。
- 記録生成時のremaining=58,000の後、発行時59,000へ逆行する負の対照で、元上限以内でも単調性違反を拒否。lastを発行時に再初期化しない。
- 外部入力はscenario名1項目だけ。未知key・getter・proxy・独自prototypeを拒否し、秘密markerを返さない。native／network／timerなしで全33ケースを実行。

初回の新規63件は成功。その後release404の固定ケースを追加し、最終64件・関連8ファイルを再確認した。この実装工程でテスト失敗は発生していない。

## 4 残課題と閉鎖

ST-03Bの一度限りconsumer・発行後失効の統合、ST-03Cの注入Response→ST-02同reader cleanup→private record→消費は未実装。ST-03Aのdraft保持・stop時破棄は、これらの連続接続や実session／source／ReleasePermit／canonical予算へのbindingを証明しない。

STC-T01〜STC-T20全体の達成とは主張せず、STC-A01〜A05／親のruntime承認は未実施。正式発行口閉鎖・Unknown・全体受付無効・VM／監視／telemetry調査保留を維持する。実session接続・実通信・実機操作・設定変更は行っていない。
