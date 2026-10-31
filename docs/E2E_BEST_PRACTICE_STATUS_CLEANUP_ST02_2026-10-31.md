# AU-BR-006 ST-02：注入Response／Streamsのcancel-only cleanup検証

Date: 2026-10-31 / Scope: ローカル注入Response／Streamsとfake clock。実通信／実session／実機E2Eではない。

## 1 変更範囲

[詳細設計§11](BEST_PRACTICE_ABORT_SCOPE_STATUS_ONLY_TERMINAL_DESIGN.md)の開発専用ownerを追加した。既存native body adapter、ST-01の合成台帳、session／source／ReleasePermit、MCP dispatchは変更しない。固定したnative getter／操作だけを使い、同readerのclosed capture→cancel→pre-release snapshot→releaseLock→post-clockを実行する。read APIはなく、read=0。

stop／close／finishは同cleanup promiseへ合流し、明示finishは一度限り。partial acquisition・cancel／closed／release失敗・期限／時計異常でprimaryとcleanupを分けて保持する。返却はcleanup_diagnostic_onlyで全7権限=false。HTTPが成功した、status証拠が発行された、という意味ではない。

## 2 実行結果

| 確認 | 結果 |
|---|---|
| `bdo npm run build` | 成功 |
| 関連7ファイルのVitest（下記） | 3,254件成功。新規status-cleanupは41件 |
| `bdo node tests/review/package-http-classification.mjs` | 409ファイルのdry-run確認成功。新module／fixture非同梱、packaged runtime JSから依存なし |
| compiled注入fixture | fetchを禁止。同reader identity、closed→cancel→release各1回、read=0、timer解放、二重finish拒否、全権限falseを確認 |

実行した関連テスト：`tests/review/status-cleanup.test.ts`、`status-terminal.test.ts`、`http-classification.test.ts`、`http-classification-legacy.test.ts`、`native-reader-adapter.test.ts`、`native-body-bootstrap.test.ts`、`native-ownership-contract.test.ts`（全てtests/review配下）。全体テスト一式は今回再実行していない。

## 3 初回失敗の切り分け

初回は36件中34件成功、2件失敗。対象を絞って同じ2件の失敗を再現し、stackと既存の同種試験を照合した。

1. stream再使用試験が、取消後のdisturbed streamから新しいResponseを作ろうとして、owner呼出し前にNodeのconstructorで失敗した。2つ目のResponseを取消前に用意する方式へ変更し、再使用拒否の2件成功を確認した。
2. getter非実行試験が、試験自身の最後の`stream.locked`で禁止用getterを呼んでいた。検査にはprototypeから固定したnative getterを使い、owner由来の呼出し数0とunlockを確認した。

製品の期限・待機条件・テストtimeoutは緩和せず、この2点では製品コードも変更していない。その後36件成功、追加4境界を含む40件成功を確認した。

追加レビューでは、primaryがauthentication_failed／access_deniedなら取得用cleanup handleを返せる条件が、post-acquire clock callbackからの取消も見逃すことを発見した。401取得中にcloseする回帰試験を追加し、修正前に取得ok=trueとなる失敗を確認した。primaryとは独立したrevoked flagと固定stop_reasonを追加し、先行HTTP診断を保ったまま、取消済みの取得はhandleを返さず同readerを解放するよう修正した。修正後は新規41件と関連7ファイルを再実行した。

## 4 確認した境界

- native操作の外側の観測と手書き期待値で同reader・順序・回数を照合。製品cleanup判定helperは共有しない。
- cancel同期throw／reject／pending、closed capture失敗／reject／pending、getReader失敗、release前後のthrowを区別。unlockしないrelease失敗は未確認のまま、再releaseしない（fixtureの外側でのみ後片付け）。
- 元floorの等号・期限後・post-releaseの期限越え・clock throw／逆行で確認を拒否。未完了cancelやreleaseで変化したclosedが遅れてsettleしても終端は不変。
- hard HTTP診断とcleanup失敗、取消・close・finishの合流、二重finish／取得／foreign handle、使用済み／proxy／偽造／locked／subclass／再使用を確認。
- 真正no_bodyでは操作0・not_applicableを確認。200／429／500は採用せず所有resourceだけ片付け、既存のbody／retry分岐は有効化しない。

## 5 未確認と停止状態

実HTTP要求／認証snapshot／session／source／ReleasePermit／canonical予算への正式binding、C/G更新、status terminalの一度限りconsumeへの接続、公開終了code、retry／fallbackは未実装。read=0はreader呼出しの会計であり、prefetchやネットワーク受信量0の証明ではない。

ST-T01〜ST-T20（追加ST-T17aを含む）全体の達成とは主張しない。ST-A01〜ST-A07／親A01〜A07のruntime承認は未実施。正式発行口閉鎖・Unknown・全体受付無効・VM／監視／telemetry調査保留を維持する。実session接続・実通信・実機操作・設定変更は行っていない。
