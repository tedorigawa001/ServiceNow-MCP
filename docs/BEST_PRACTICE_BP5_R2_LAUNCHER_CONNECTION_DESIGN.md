# BP-5 R-2：オフライン事前確認・明示承認・ready案内・終了報告の接続設計

Version: draft-0.3 / Date: 2026-10-18 / Status: checker・限定確認票のみ内部実装/合成検証。人向け接続・実機/運用は未承認・未実装。

## 1. 範囲と現状

[runner接続設計](BEST_PRACTICE_BP5_R2_PDI_ADAPTER_RUNNER_DESIGN.md)と
[host終了設計§13](BEST_PRACTICE_BP5_R2_HOST_SHUTDOWN_DESIGN.md#13-秘密を持たない外部監督2026-10-18)の内部PoCを、
人が明示的に開始・停止し、結果を確認できるリポジトリ内の専用入口へ接続する案。
公開CLI/bin/MCP登録・npm同梱・既存auth CLIとの接続は対象外。

| 既存実装 | この設計で追加するもの（§9のchecker以外は未実装） |
|---|---|
| manifestの安全な読込・期限/binding・消費直前再検証 | オフラインcheck-plan、公開値を限定した確認票、実行承認との結合 |
| 専用host・秘密を持たない監督・固定IPC | 確認済みmanifestとhostが使う計画の一致検証 |
| 監督の同期onReady通知 | 固定start URLを案内する人向け接続 |
| 監督が検証済みreportを呼出し元へ返す | 終了報告のstrict検証、端末への限定表示 |
| 専用entryは終了コードだけで終了 | 明示実行モードと上記の接続。現entryをそのまま使えば案内・報告も出る、とはしない |

接続全体のうち今回の実装範囲は§9だけ。telemetry調査・maint依頼は保留。
実機操作・token発行・アカウント/登録/ACL/設定変更は行わない。
実manifestの作成・配置・領域設定も行わない。設計の承認と、G2/G4の実行許可は別である。

## 2. 責任分離

| 所有者 | 受け取るもの・責任 | 渡さないもの |
|---|---|---|
| オフラインchecker（独立した固定プロセス） | 信頼済みmanifestを読み、構造/所有者/ACL/期限/bindingと正規化digestを確認 | 本文、ID、origin、path、承認参照、秘密を報告へコピーしない |
| 専用launcher/監督 | 非秘密path、checkerの限定票・digest、TTY承認、ready通知、監督終了報告 | manifest本文、code/token/state/verifier、任意module/endpoint |
| 専用host | manifest再読込・snapshot、OAuth・本人確認・MCP・秘密一致検査 | 認可URL・秘密・本人IDをIPC/argv/envへ渡さない |
| 人の実行担当 | 外部の承認記録と対象計画を照合し、TTYで今回1回の実行を承認 | token/codeの貼付け、端末への資格情報入力 |

checkerは既存の信頼済み読込器を利用する別の処理であり、監督自身がmanifest本文を読む設計へ変えない。
固定プロセスはshellなし・空env・検証済み起動flag、raw stdout/stderrはignore、検証済み限定IPCだけを使う。
launcher自身も秘密を注入しない専用起動環境を前提とし、共有アプリへのsignal handler追加はしない。

## 3. 起動契約とcheck-plan

入口名・引数の正確な構文は実装時に別途固定する。本書のモード名は設計上の名前で、実行可能なコマンド例ではない。

- 既定は`check-plan`。未知mode/option、相対path、複数path、任意query/flag/env指定は固定理由で拒否する。
- 入力は既存の非秘密manifest絶対pathのみ。探索・自動作成・権限修復・期限延長はしない。
- checkerでは既存load/consumeの再読込検査と同じ検証を行うが、consumerは純粋な確認票作成だけ。
  listener/host/SDK/browser/workerの起動、DNS/HTTPS、PDIの照会を一切しない。
- checker実行の観測上限は5秒。所有checkerだけを停止し、exit/closeを確認する。確認不能は失敗とし実行へ進まない。
- 確認時の承認期限とC方式assertionは、従来どおり現在+385秒より厳密に後が必要。実行直前も再検証する。
  ただし人の確認待ち60秒・host preflight 5秒の後にも満たせなければ、承認後に予測可能な期限不足で停止する。
  checkerは385+60+5秒（450秒）超を満たさない場合、合格とせず固定の`validity_insufficient_for_approval`で停止する（§9へ実装）。
  これはchecker側の要求を厳しくするだけで、実行時の385秒の再検証を置き換えない。
- 成功は`offline_valid`であって、承認の真正性、Public Client/S256の実効性、ACL、リリースmatched、PDI到達を証明しない。
  `approval.reference`の存在は人の承認証明ではない。assertionなしは実測が必要、という既存扱いも維持する。

確認票は新しい内部strict契約（例：`bp5-r2-plan-check-0.1`）とし、固定mode/status/code、
構造/ファイル信頼性/binding/期限の検査済みbool、selection_mode、max_records、実装済みrule_id集合、
C設定の有無bool、正規化digestだけに限定する。生のスキーマissue/例外/ファイル情報は出力しない。
未確認の項目をbool=trueで表さず、PDI関連は固定の`not_verified`として区別する。
digestは既存スキーマで正規化した文書のJSONをSHA-256にした値。署名でも認可capabilityでもない。
報告はchecker終了後に検証済み値から再構成し、checkerが正常終了しただけでは採用しない。

## 4. 明示実行・人の承認・計画変更

`check-plan → 外部承認との照合 → TTY確認 → host preflight再照合 → grant → ready → 認可 → 終了報告`

1. `run`の明示指定でもcheckerを省略しない。過去のcheck-plan結果を読ませる入力口は設けない。
2. 実行担当が非公開の承認記録を照合する。対象PDI・利用者・専用登録・read ACL 2件・Update Set・scope・
   C設定・発行回数/寿命・ブラウザープロファイル・失効担当・復旧がG2/G4で承認済みでなければ進まない。
3. launcherは検証済み確認票とdigest、固定の危険/限界説明だけを端末へ提示する。
   対象ID等を端末で再表示する代わりに、人は信頼済みの非公開計画と承認記録を別に照合する。
   digestの一致だけでその照合を代替しない。
4. 実TTYから固定文言の入力で今回1回だけ承認する。`--yes`、env、stdin pipe、既定yes、承認ファイルの自動採用は認めない。
   60秒以内の承認待ちを上限案とし、EOF・時間切れ・非TTY・否認・SIGINTでhost起動前に停止する。
   入力はcooked modeで1行だけ読む案とし、Ctrl-CをOSのSIGINTとして受ける。raw modeを使う場合は
   `\x03`とEOF（`\x04`）を明示的に否認として扱い、端末モードを必ず元に戻してから次へ進む。
   これは新しい人向け待ち上限で、製品の385秒/60秒/cleanup枠を延長するものではない。
5. 承認後に所有checkerの終了確認を済ませ、専用hostを起動する。host preflightの5秒上限は維持する。
   hostが再検証した正規化digestと確認票のdigestを照合し、一致時だけ監督がgrantを送る。
6. 意味の変更・期限不足・検査失敗はgrant前に停止する。意味が同じ表記揺れ（空白・改行・オブジェクトkeyの順序）は
   スキーマ正規化後のdigestが同じため許容する。重複keyは既存読込器が拒否するため、この許容に含まれない。
   不一致後の自動再確認/再承認/再起動はしない。新しい明示実行から始める。

**必要な未実装契約変更**：現行preparedは固定識別子だけなので、digest照合を現実装が保証するとは扱わない。
hostが実際にrunnerへ渡すsnapshotとdigestを結び付ける内部handleを設ける必要がある。
単にprepared時にファイルを一度hashし、その後runnerが別の内容を読み直すだけでは不十分。
消費直前の再読込で同digestを必須とする信頼済み期待digestをrunner/読込器へ伝播し、snapshot固定後に実行する。
内部prepared/grant契約の版分け・strict allowlist・旧controller互換方針を実装前に確定する。
旧形式へ自動fallbackせず、照合不能なら停止する。公開MCP JSON 0.2/0.3は変更しない。

承認待ちは認可/実行期限の外だが、期限を再付与する口ではない。時刻・有効余裕は承認後も再検査する。
grant準備時のT0から382秒で作業停止、385秒で所有hostの強制停止要求、cleanup最大3秒、終了観測最大1秒は既存どおり。
オフライン検査5秒・人の確認60秒・host preflight5秒は各1回で、実行予算へ上乗せしてhost稼働を延長しない。

## 5. ready案内とブラウザー

- 検証済みのreadyを1回受けた後だけ、同期onReadyで固定URL `http://127.0.0.1:18765/bp5/start` を案内する。
  IPCから受け取った任意文字列をURLとして表示しない。案内にpath/manifest本文/認可URLを含めない。
- 開始ページを事前にGET/HEADして確認しない。一度限りのページをchecker/preview/link scannerが消費しないようにする。
- 人が管理者cookieと分離した専用ブラウザープロファイルで開く。自動ブラウザー起動・認可URLのargv渡し・
  自動redirect/submit・code貼付けはしない。認可ページで本人がログイン・同意する。
- ready案内に失敗したら固定理由で監督を停止する。onReadyは同期undefined限定、Promise/throwは既存どおり失敗。
  表示が完了するまで認可期限を止める・再取得する・再起動する処理は作らない。
- 18765競合なら他portへ代替せず、他listenerを終了しない。開始ページの再取得/先取りも再認可で救済しない。
- SIGINT/TERMは既存監督の停止経路へ接続する。再入力はforce、共有process group/他の子へsignalを送らない。
- 現行`superviseR2Host`は実行中に自身のSIGINT/SIGTERM handlerを登録する。launcherがTTY承認用のhandlerを
  残したまま監督を起動すると、1回のCtrl-Cを双方が受けて監督の「2回目=force」と重なり得る。
  runnerの`signalOwner`と同様に監督にもsignal所有者を選ぶ信頼済み内部optionを設けるか、
  監督起動前にlauncher自身のhandlerを解除することを契約として固定し、二重計数しない合成試験を必須とする。

ブラウザーの履歴/query・OS dump・端末の外部記録は完全削除を保証できない。
履歴同期・HAR/スクリーンショット・診断採取・core dump等の既存運用が秘密管理要件を満たすか、人が実行前に確認する。
launcherは勝手に設定を変更しない。不適合なら開始しない。

## 6. 終了報告と出力先

### 6.1 採用と表示

監督自身の終了報告`bp5-r2-host-exit-0.1`を新たにstrict検証する境界を設ける。
現状は内部型/監督検証であり、launcher用の報告スキーマ・出力接続は未実装。
hostの生IPCやfinishedを直接表示せず、ack・期待exit・exit/close・期限内の採用条件を満たした監督reportだけを扱う。

既定は人向け固定summaryを端末へ1回表示する。fieldはterminal_reason、process_termination、cleanup、
token_issuance、other_account_token、host_exit、kill_requestと、採用済みの場合だけ内側のschema_version/status/isError、
固定count・limitations/rejectionの理由別件数に限定する。動的理由文字列はコピーせず既存列挙値を集計する。
資産名・sys_id・接続先・path・承認参照・自由記述・元例外・コード本文は表示しない。
summaryのschema不正/集計失敗では生reportへfallbackせず`report_unavailable`だけにする。

完全な採用済みJSONを信頼済み同一プロセスconsumerへ返す既存APIは維持するが、今回の端末入口では表示・保存しない。
任意callback/module指定・結果ファイル・標準出力への全JSON dump・自動アップロードは追加しない。
将来のJSON保存/配布は出力先の権限・所有者・symlink・上限・秘密検査を含む別設計/承認とする。

### 6.2 失敗・未知の扱い

- `completed`はlifecycle終了であり、安全/適合/全件解析済みではない。partial・isError・未処理理由を維持する。
- kill_request=sentは終了確認ではない。終了未確認・cleanup unknown/incompleteを成功へ変換しない。
- 終了票なし・無効票・fatal/強制停止ではtoken状態をunknownのまま残す。発行通知がなかったことを未発行の証拠にしない。
- 取消しと成功票の競合が現行のprotocol_errorとして終わる場合も、その固定理由を改変しない。再開せずtoken unknownとして扱う。
- ローカルcleanupやhost終了はサーバーtoken失効ではない。別アカウントtoken/refreshの可能性も承認済み担当へ引き継ぐ。
  自動失効・同意取消・再認可・再実行はしない。
- launcherの表示失敗と元の監督結果は別に保持する。表示のために期限超過したhostを生存させない。
  報告不可なら成功とは伝えず、実行した可能性/失効要否の確認を依頼する固定案内にする。
- 既存entryのexit code対応を維持する案。報告検証/表示失敗は非0とし、内部用の新理由/対応は実装前に確定する。
  既存のhost_exitをlauncherのcodeに置換しない。

## 7. 実装順と合成試験の受入条件

| 順 | 別途承認後に行う実装 | 合成試験で必須の証拠 |
|---|---|---|
| 1 | checker・限定確認票・固定プロセス境界 | 不正所有者/ACL/symlink/期限/binding/JSONで停止。bind/DNS/fetch/SDK/host/browserは0回。raw例外や識別値を出さず、checker終了確認 |
| 2 | TTY明示承認・digestのsnapshot結合 | 非TTY/否認/EOF/時間切れ/変更/失効でgrantなし。確認後変更とprepared後変更も拒否。空白変更は許容。承認/制御データ再利用なし |
| 3 | ready案内 | ready前は案内なし、1回だけ固定URL。未知/重複ready拒否、表示失敗で停止、ページを先取りGETしない |
| 4 | 終了報告検証・summary | 正常0.2/0.3/partial/isError、無効票・終了未確認・未知token、summary表示失敗。秘密/本文/自由文字列の非表示 |
| 5 | 監督付き一連の実プロセス試験 | 合成manifest/fetchのみで、ready→手動操作相当callback→SDK→worker→終了を確認。signal・port解放・CPU停止・fatalも既存HSと合わせる |

G2/G4未承認のまま実PDIへ接続しない。正常系が通るまで異常系のtoken発行を自動追加しない。
合成試験では実交換・外部通信を拒否し、固定合成token等は子内だけで生成する。
製品60秒・全体385秒・cleanup3秒、受信量/件数、R-2非同梱、0.2/0.3・固定評価セットは維持する。
Node下限22.12系・実TTY・HS未完了境界の確認と、G2/G4・C設定・復旧/失効担当の承認は別の開始条件として残す。

## 8. 今回の到達点

checker/限定確認票の内部実装は§9を参照。TTY/digestによる実行承認との結合/ready案内/終了summaryは未実装。
実運用の入口・実行権限・実manifestは作成していない。telemetry調査も再開しない。

## 9. 第1段階：checker・限定確認票の実装境界（2026-10-18）

[合成検証記録](E2E_BEST_PRACTICE_R2_PLAN_CHECK_SYNTHETIC_2026-10-18.md)を参照。§1の表は接続全体の計画を示し、この節だけを実装済みとする。

- `checkR2PlanOffline(path)`は既存manifest読込/consumeを通し、固定の`bp5-r2-plan-check-0.1`確認票だけを返す。
  consumeの信頼済みconsumerへ、第2引数として正規化文書のdigestを渡す最小拡張を加えた。
  従来のconsumer・状態/JSON/inspect・返却型は維持し、本文の新getterは設けない。
  digestは再読込/期限/意味の一致を確認済みsnapshotに対応するが、人の承認や後続hostと結合されたcapabilityではない。
- `r2PlanCheckSchema`は未知field拒否の成功/拒否union。成功の検査boolは全てtrue、PDIは常にnot_verified。
  拒否時は固定codeだけで、digestや部分的確認票を返さない。JSON Schemaも出力するが公開MCP登録はしない。
- 既存manifestの385秒条件に加え、checkerは承認/C設定期限が検査時刻+450秒より厳密に後であることを要求する。
  385秒を満たしても450秒以下ならvalidity_insufficient_for_approval。実行時の385秒再検証は緩めない。
- `runR2PlanCheck(path)`が固定r2-plan-check-entry子を起動する。sourceは固定tsx＋.ts、compiledは固定.js。
  空env、shellなし、detached、JSON IPC、raw stdin/stdout/stderrはignore。token入力・任意entryの公開選択口はない。
  spawnCheckerとlower-only期限は信頼済みOS合成境界だけで、CLI/manifest/MCP入力ではない。
- 実行上限5秒はspawn前からの単調時計で固定。取消/期限/不正IPCは所有checkerだけにSIGKILLを要求する。
  終了観測は最大1秒。結果を1件・8KiB以内・strict schema・対応exit code・exit/close両方・期限内で検証して採用する。
  kill要求だけで終了確認にしない。未確認時はchecker_termination_unconfirmed、結果は破棄する。
- 既定check-plan CLI、TTY承認、OS signalの人向け接続、host prepared/grantのdigest結合は追加していない。
  checkerはhostを起動せず、承認済みの実機計画でも読み取り検査以上へ進まない。失敗後の再試行/権限修復なし。
- ファイル信頼性の検査には既存の固定ローカルACLコマンド（macOS /bin/ls、Linux /usr/bin/getfacl）を利用する。
  「子プロセスを一切起動しない」ではなく、「checker自身と固定ACL検査以外のhost/実行子を起動しない」が境界。
  ACL検査不能/非対応OSもfail-closed。checker終了はOS全体・ACL utilityの完全回収やメモリゼロ化の保証ではない。
- 実manifestなし、一時fixture/合成入力だけで検証。R-2非同梱・公開JSON 0.2/0.3・製品期限は維持する。
