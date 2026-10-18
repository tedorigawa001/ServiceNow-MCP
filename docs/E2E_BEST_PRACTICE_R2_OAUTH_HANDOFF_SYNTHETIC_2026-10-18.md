# BP-5 R-2：OAuthアダプター→sessionのメモリ内引渡し合成検証

Date: 2026-10-18 / Status: 内部接続PoCの合成検証。実PDI・実認可・実token発行は未実施。

## 1. 範囲

[接続設計§11](BEST_PRACTICE_BP5_R2_PDI_ADAPTER_RUNNER_DESIGN.md#11-メモリ内session接続2026-10-18)を
`src/review/r2-oauth-session.ts`の`R2OAuthSessionConnection`に実装した。
既存の実OAuthアダプターとR2ReviewSessionを組み合わせ、tokenの生成/本人確認/レビューのHTTP境界だけを合成fetchへ置換。
内部クラスや本人確認をモックせず、正常系は既存executor・XML/AST・実workerを通す。

telemetry調査・maint担当者への依頼は保留。実機操作、token発行、登録/アカウント/ロール/ACL/設定変更なし。
HTTP待受・開始ページ・ブラウザー操作・manifest読込・runner/SDK一連の接続・OS signalは未実装。
公開CLI/server.ts/MCP定義・既存認証・固定評価セット・依存設定は変更していない。

## 2. 所有権と本人確認の境界

接続層が開始時にorigin/client/期待利用者/Update Set/C方式設定をコピーし、後から渡された計画の変更を受けない。
sys_idや本人確認用の上限に不備があれば認可前に拒否する。adapterとsessionは同じ固定transport/clockを使う。

`exchangeAndVerify`は固定交換後に`consumeToken`を1回だけ使い、その内部consumerでsessionを生成する。
token/issuedAtは交換応答由来の同じ値。sessionには接続層のroot signalを渡し、adapterの内部signalは渡さない。
adapter成功cleanupがsessionを誤取消しないことと、runner相当の外部Abortで両方を停止できることを確認した。

続いて固定GET本人確認。成功するまでレビュー/metadata/payload/リリース照会へ進まない。
成功時は`{ok:true}`だけを返し、session/token/permitを公開しない。内部permitをreviewが1回消費する。
reviewは既存R2ReviewSession→executorへ直接接続し、既存の0.2/0.3 JSONを変更しない。
SDK経由のlist/callは既存の別テストであり、今回のOAuth接続からSDKまで通したとは数えない。

失敗/取消/期限/closeは内部token・permit・timer・外部Abort購読を破棄する。
closeは冪等で、既存session.closeの最大2秒の終了待ちを再利用し、失敗時は固定cleanup_incompleteとする。
cleanup失敗の実workerプロセス試験や385秒のOS runner監督は今回の検証対象外。

## 3. 別アカウントのcode注入

同じstateとrunnerのS256 challengeに結び付いた、別アカウントのcodeを合成境界から渡した。
交換時にverifierのSHA-256と元challengeの一致を確認し、交換自体は成功させた。
そのtokenで固定GETが別sys_idを返した場合、実sessionがidentity_mismatchを返し、レビュー取得は0回だった。

state/PKCEだけでは同一端末からのアカウント差替えを排除しない。今回は交換前の攻撃防止や
実アカウントを使った侵入試験ではなく、交換後の本人確認でレビューを止める接続試験である。

状態/JSON/inspectはphase・hasCredentialと次の保守的boolだけ。本人ID/資格情報/元応答は含めない。

- tokenMayHaveBeenIssued：交換POST開始時点でtrue。正常交換以外も、未発行と断定しない。
- otherAccountTokenPossible：本人不一致でtrue。対象IDを表示せず、失効検討が必要な可能性を残す。

本人不一致でもローカル破棄をサーバー失効とは扱わない。自動失効・自動再認可・service-account代替はない。
終了票の実装と承認済み担当者による失効手順への接続はrunnerの後続工程。

## 4. 回帰ケース

| 観点 | 確認したこと |
|---|---|
| 正常引渡し | 同じ固定origin/tokenによる現在ユーザーGET、secret/session/permitを返さない |
| code注入 | 正しいstate/S256の別アカウントcodeでも本人不一致で停止。レビュー取得なし、発行済み/別アカウントの可能性あり |
| 本人確認失敗 | 401/403/404/500、空/複数/表示値型で安全側停止。後続のreviewも拒否 |
| 正常レビュー | 本人確認後だけ同じtokenで取得、既存workerへ到達、0.3契約・BR1件/候補1件、本文非露出、再レビューなし |
| 時刻 | 交換開始から寿命を消費し、handoff完了時にリセットしない。残り60秒ちょうどはreview前に停止 |
| 計画固定 | 呼出し元によるorigin/client/期待ID/scope変更を受けない。上限不正は認可前に拒否 |
| 中断 | 交換/本人確認の非協調I/Oを中断、遅延bodyをcancelし復活しない。root/call両方からbounded reviewを停止 |
| 期限/片付け | 未使用token期限、認可待ち期限、描画失敗、明示close、外部購読/timer除去、rootの誤取消しなし |
| 再要求 | 再認可URL要求で確認済みsessionを壊さない。並行reviewはbusyで既存処理を取り消さない |
| 非露出 | status/JSON/inspect/固定失敗/stdout/stderrへ合成secret、本人ID、認可state/URL、コード本文を出さない |

29件は回帰テスト数であり、独立した盲検評価標本や最小権限の実証ではない。
JS文字列の完全消去や信頼済みtransportのコピー、OSメモリ/ダンプからの除去は保証しない。

## 5. 実行結果

```bash
bdo npm test -- tests/review/r2-oauth-session.test.ts
bdo npm run type-check
bdo npm run lint -- --quiet
bdo npm test
bdo npm run build
bdo npm run test:pack
bdo git -c core.fsmonitor=false diff --check
```

- 新規結合：1ファイル・29テスト成功。
- 全体回帰：106ファイル・2,674テスト成功（実機E2E・transport専用構成は対象外）。
- TypeScript型検査・ESLint・build成功。
- 梱包：361 files。本番依存のみのインストール、既定worker解析/集約・MCP smoke成功。
  既存の`!dist/review/r2-*`と梱包試験により、新接続層もnpm非同梱を維持。配布設定/依存変更なし。

テスト→実装の順に、未実装モジュール/未実装reviewの失敗を確認して接続した。
追加の境界テストで明示closeの理由欠落、期限/描画失敗後の接続状態・購読残存、確認済み状態への再認可要求の
誤終了を再現し、原因を分けて修正した。本人確認上限はsession生成時ではなく認可前に検査するようにした。
正常系テストのoutcome参照は既存isError契約へ合わせた。中断テストの当初の待機対象は誤ってrelease照会だったため、
実装の実際の先頭取得（親レコード）へ合わせて再実行した。これらの試験の誤りを製品不具合と数えない。

## 6. 未確認・次工程

1. HTTP listener/開始ページのHost/method/body検査、1回限り表示、bind/HTML/CSP。手動code入力は追加しない。
2. 承認manifest読込・runner→SDK list/call、全体期限・SIGINT/SIGTERM・専用プロセス終了/終了票。
3. 実本人確認APIの挙動/自己参照ACL、専用利用者/ロール/ACL/OAuth登録、Public Client/S256/loopback/C方式の承認と実機検証。
4. refresh発行や本人不一致/通信結果不明の失効対応。ローカル破棄を失効成功としない。

実装・合成成功を実機操作やtoken発行の許可として扱わない。telemetry調査は再開しない。
