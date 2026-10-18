# BP-5 R-2：TTY明示承認・snapshot digest結合の合成検証

Date: 2026-10-18 / 内部PoC。実PDI操作・実token発行・実設定変更なし。telemetry調査は保留。

## 1. 範囲

[専用入口設計§10](BEST_PRACTICE_BP5_R2_LAUNCHER_CONNECTION_DESIGN.md)の第2段階。
r2-tty-approval.tsとr2-approved-launch.tsを追加し、host entry/host/監督/runnerに承認付き経路を接続した。
公開CLI/MCP/bin/npm同梱、readyの人向け案内、最終summary、実manifest配置は追加していない。
既存の未公開内部APIを呼べることを、G2/G4承認・利用者/登録/ACL作成・実機実行の許可と解釈しない。

## 2. 接続・責任境界

1. 今回のchecker結果だけを採用する。ファイル信頼性・450秒余裕・binding・schemaが不正なら承認入力へ進まない。
2. 検証済み限定確認票とdigestだけを専用cooked TTYへ出し、APPROVEの1行を60秒以内で要求する。
3. 否認/非TTY/raw mode/先行入力/競合reader/EOF/取消/出力失敗はhost起動前に停止する。
4. launcherのSIGINT/TERM handlerを解除してから監督へ同期的に引き渡す。監督だけが以降のsignalを数える。
5. 監督は固定host entryへ非秘密の--approval-boundだけを追加する。digestや資格情報をargv/envへ渡さない。
6. hostが再検査したmanifestのdigestをprepared_v2へ載せる。監督は今回確認digestと一致時だけrun_grant_v2を送る。
7. hostもgrantのdigestを検査し、runnerへ期待digestを固定する。runnerはconsumeが再検査したimmutable snapshotと比較してからbindする。
8. 期限切れや意味変更はpreflight/consumeで拒否。開始後はsnapshotを固定し、ファイルの後続変更へ追従しない。

旧prepared/run_grantは既存内部controller向けに維持する。承認付き経路では旧形式への降格・再試行・自動再承認なし。
監督は引き続きmanifest本文を読まず、token/code/state/verifierを保持しない。
型付きの期待digestは信頼済み内部optionであり、公開MCP入力でも同一UID侵害に耐える認可capabilityでもない。
人の承認記録の真正性をプログラムが証明するわけではなく、担当者による外部計画との照合が依然必要。

## 3. TTYの契約・試験境界

- 入出力isTTY必須、isRawは拒否。モードは変更しない。入力競合/先行bufferがあれば停止する。
- 限定確認票は再度strict schemaで検証し、digest一致も必須。raw計画や任意prompt文は受け取らない。
- APPROVE LF/CRLFだけを受理する。複数行/否認/非ASCII/64byte超/Ctrl-C/EOFを拒否し、入力値をアプリから反射しない。
- 表示完了前には入力を受理しない。60秒の単調時計を表示完了/入力時にも照合し、遅いcallback/入力で期限を延長しない。
- 終了時は専用入力をpauseし、所有data/end/close/error、Abort、process signal購読とtimerだけを解放する。
  terminalをdestroyしたり他のprocess handlerを削除したりしない。
- PassThrough/WritableのisTTY境界を合成した試験であり、実PTY/TTY配送・人の採点/承認を実施したものではない。
  cooked modeのOS echo・端末記録・ユーザーによる誤った秘密入力の非露出までは保証しない。資格情報入力は禁止。

## 4. 検証した経路

| 区分 | 内容 |
|---|---|
| TTY | 正しい1行、否認/複数行/小文字/制御文字/上限、非TTY/raw/先行入力、60秒境界、EOF/外部Abort/SIGINT/表示例外、購読解放、不正確認票の非表示 |
| 一連の接続 | 実checker子→限定票→合成TTY→監督。否認はhost 0回、期限切れcheckはprompt 0回。承認待ち中の意味変更/期限切れはgrantなしで実hostを停止 |
| signal所有 | OS spawn境界でlauncher handler不在、監督実行中は所有handler 1件だけ。終了後に元の購読数へ戻る |
| 監督 | 正しいprepared_v2のみgrant_v2。digest違い/extra field/旧prepared拒否、SIGKILL要求・終了確認、token unknown維持 |
| 実host | prepared後の変更、grant後の合成wall clock期限切れ、旧grant/digest違いを拒否。試験fixtureはlistenを禁止し、外部fetchも禁止。stdout/stderr空 |
| runner | consumed snapshotのdigest違いはbind/issuer/readyなし。正しいdigestは実固定entry→host→runnerのreadyに到達し、認可操作前の取消でcleanup complete/終了確認/token not_attempted |

一時0600 manifestと架空URL/IDだけを使用して削除した。ready到達の試験は既存の固定port suiteへ集約し、他ファイルと18765を奪い合わない。
認可リンクのクリック・ブラウザー操作・実code/token交換は行っていない。実host ready経路でもcallbackを送らず中止した。
SDK/解析を含む既存の合成回帰は従来のfake fetchのみ。製品60秒/全体385秒/cleanup3秒、preflight5秒/事前余裕450秒を延長しない。

## 5. RED・途中失敗と切り分け

TDDでsnapshot不一致のRED（旧runnerがdigestを無視しcallback_unavailableまで進む）、TTYモジュール未実装のRED、
prepared_v2未対応のREDを確認してから各境界を実装した。

新規テストの追加strict TypeScript検査は、pipe指定したchild.stdout/stderrのnullable型で2件失敗した。
stdioの固定指定を照合し、テスト側の非null表明だけを訂正した。通常プロジェクト型検査は成功していた。

承認待ち中に期限切れになった実hostの試験は、host_failedだけを期待して失敗した。
現行監督はhostのpreflight終了時、IPC disconnect→exitならprotocol_error、exit先行ならhost_failedになり得る。
ソースのdisconnected/exited経路と実出力を照合し、停止処理は変更せず両方を既存の固定失敗理由として許した。
終了確認・票非採用・token unknown・再実行なしを不変条件として採点する。

同じ期待値のまま走った初回全体回帰は115ファイル中114成功・1失敗、2,963件成功・1件失敗、31.52秒。
上記1件以外は成功。修正後は115ファイル・2,964件成功（30.82秒）。この途中失敗は撤回しない。
限定確認票の提示/不正票テスト追加後の最終結果は次節に記録する。

## 6. 最終検証結果

| 検証 | 結果 |
|---|---|
| 新規TTY/launch/bound-host + supervisorの合成試験（2 workers） | 4ファイル・73件成功、2.25秒 |
| 固定portの既存runner/loopback suite | 108件成功、11.95秒。snapshot不一致/一致の実経路2件を追加 |
| 最終全体回帰（ローカル待受許可環境、2 workers） | 115ファイル・2,965件成功、43.26秒 |
| `npm run type-check` | 成功 |
| 新規3テスト＋共有fixtureの明示的strict TypeScript検査 | 成功 |
| 変更した6実装・7テスト/fixtureのESLint | エラー/警告なし |
| `npm run test:pack` | build・361ファイルのproduction-only導入・解析/集約worker・MCP smoke成功。R-2非同梱を維持 |
| compiled固定.jsの承認付きhost smoke | 合成manifestのdigest照合→ready→認可前取消し、cleanup complete・終了確認・token not_attempted。fixture削除 |
| `git diff --check` / ローカル文書リンク | 成功 / 25件の参照先存在を確認 |

追加35件（TTY19、launch6、bound host4、supervisor4、既存runner suiteへ2）。
TDD・systematic-debuggingでRED/途中失敗の原因を分離し、verification-before-completionに従って実出力を確認した。
型・lint・梱包も限定確認票の提示追加後に再実行した。実機操作・発行・設定変更・配布/公開の検証ではない。

## 7. 残課題

- 公開CLI/実行入口、readyの人向け固定URL案内、終了reportのstrict summary表示/保存方針は未接続。
- 実TTY/Node下限22.12系/他OS、HS未完了境界、G2/G4・復旧/失効担当、Public Client/S256/loopback/本人ACL/C方式の実機成立は未確認/未承認。
- 外部承認の真正性、同一UID侵害、OS全体の停止、完全メモリ消去、サーバーtoken失効は保証しない。
- host票がない強制停止/異常終了はtoken unknown。no-readyや未通知を未発行の証拠にしない。自動失効・再認可なし。
- 同じファイルを人が承認後に意図的に差し替えても、既存snapshotへ追従させず停止する。開始後の固定snapshotは別の意味である。
- telemetry調査・maint担当者への連絡は保留。実機操作・実発行・設定変更は行っていない。
