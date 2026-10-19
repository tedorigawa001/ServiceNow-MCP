# BP-5 R-2：安全な外側起動手順

Version: draft-0.5 / Date: 2026-10-19 / Status: record検査とOL-03のgated exec部品を内部実装/合成検証。runtime trust gate・署名/配備・実Node適合・運用承認は未完了。

OL-01の推奨選定案は[Rust/macOS arm64・ビルド/配備/起動台帳設計](BEST_PRACTICE_BP5_R2_OL01_BUILD_DEPLOY_LEDGER_DESIGN.md)を参照。
人の採択・正確なtoolchain/OS版・署名担当・実配備は未確定であり、OL-01完了ではない。
OL-02のスキーマ・FD reader・合成検証は[record検証記録](E2E_BEST_PRACTICE_R2_OL02_RECORDS_SYNTHETIC_2026-10-19.md)を参照。
戻り値は実行permitではない。後続[OL-03 exec部品検証](E2E_BEST_PRACTICE_R2_OL03_EXEC_SYNTHETIC_2026-10-19.md)では
固定argv/空env/FD/cwd/limits/execを合成OS peerで確認したが、runtime trust gateは92で拒否する状態を維持する。
実Node・署名/closure・直前再検証は未完了で、外側launcher全体の起動許可と区別する。

## 1. 判断と範囲

私たちは、Nodeが開始してから環境を検査するだけでは、Node開始前のpreload等を防げないという境界を扱う。
今回確認したentryは空env・execArgvなしを検査するが、検査に到達する以前の実行を取り消せない。
推奨案は、信頼済みのPOSIX専用外側launcherが環境・成果物・端末を検査し、固定Nodeへexecする方式である。
ここで仕様を具体化することと、launcherを実装・配備して安全性を確認することは分ける。

対象はリポジトリ内部PoCの起動境界だけ。公開bin/npm登録、MCP登録、既存CLIや共有serverの変更、
OS全体の設定変更、実manifest作成・配置、PDI接続、認可・token発行は含めない。
telemetry調査・maint依頼は保留を維持する。G2/G4の個別承認を本書で代替しない。

## 2. 根拠と現在の到達点

確認した基準revisionは`389ccc755a1ef35506175a481ecc8e853a92d3fc`。本書はソース照合に基づく提案であり、
新しいOS設定・起動実験・性能測定や、公式仕様の追加調査を実施した記録ではない。

| 根拠 | コード/記録から確認した内容 | 本書で証明できないこと |
|---|---|---|
| [専用entry](../src/review/r2-launcher-entry.ts) | compiled .js/POSIX、execArgvなし、空envを検査。既定check-planと承認付きrunへ固定dispatch | Node開始前の注入防止、実行ファイルの真正性 |
| [最小bootstrap](../src/review/r2-launcher-bootstrap.ts) | fatal理由をformatせず、既知73＞71＞70を保持 | bootstrap以前のnative/loader診断の抑止 |
| [承認付きlauncher](../src/review/r2-approved-launch.ts) | checker・TTY承認・digest結合、監督後のsignal再取得と限定summary | 実TTY配送、外側の安全性、人の承認の真偽 |
| [実OS signal検証§8](E2E_BEST_PRACTICE_R2_RUN_ENTRY_SYNTHETIC_2026-10-19.md#8-専用entry子プロセスへの実os-signal配送2026-10-19) | 合成OS peerと独立entryでSIGINT/SIGTERM時の71/73保持 | 実PTYのCtrl-C、実OAuth、すべてのOS障害 |
| [package.json](../package.json) | Node下限22.12、R-2はnpm梱包対象外。公開R-2起動コマンドなし | Node下限実行済み、外側launcher同梱済み |

構造上の課題は「起動するNode自身の安全な起動条件を、Node内の検査だけに委ねない」ことである。
既存のentry検査は深い位置の防御として残し、外側の実装後も削除しない。

## 3. 選択肢と推奨

**案1：信頼済み端末で手順書を守って直接起動。** 追加プロセスや専用バイナリが不要で、作業量は小さい。
ただしshell alias/function、PATH、環境継承やNode実体の選定を人に毎回委ねる。空env相当のコマンドも、
それを実行するshellやenv実行ファイル自体の信頼性を作らない。比較基準に留め、今回の安全な起動境界の完成とはしない。

**案2：固定の非Node外側launcherで検査してexec（推奨案、OL-01別紙ではRustを提案）。**
起動条件を1か所へ集約し、拒否時はNodeを起動しない。Nodeで外側launcherを書くと、そのNodeの起動問題が再帰するため採らない。
初期案はmacOS arm64の信頼済み実行ファイルとし、実行時setuid/root権限は使わない。
Rust・署名済みビルド・管理担当によるroot所有配備・二段階台帳はOL-01の提案で、人の承認と環境の確定は未完了。
shell scriptはinterpreter起動前の継承問題があるので、同等性を検証する別設計なしに代用しない。
非Node化だけで外側launcher自身のloaderを保護できるわけではない。
外側launcherが動く以前の環境も適合させるOS管理下の起動元と、その検証方法をOL-01で確定する。
任意の汚染済みshellから起動しても安全、とはしない。信頼の起点を用意できなければOL-01未完了として開始しない。
小さな外側部品の配備・更新・検査が増えるが、exec後に常駐監督や秘密バッファを追加しない利点がある。

| 比較軸 | 案1 | 案2 | 根拠/確認方法 |
|---|---|---|---|
| 安全性 | 手順の省略・取り違えが残る | Node起動前に固定条件を強制できる設計 | ソース由来の期待。注入marker/不適合成果物で後続起動0回を試験する |
| 性能/メモリ | 追加検査なし | 起動時のstat/ACL/hash I/O、exec前の一時メモリが増える | 未測定。固定成果物で起動遅延/ピークRSS/FD数を比較。予算は実装前に合意 |
| 信頼性 | 人の環境に依存 | 検査不能も停止するため開始不可が増える | 仮説。権限・端末・時計・ファイル競合を試験する |
| 運用性 | 初期負担は小さいが毎回の点検が重い | 信頼済み成果物台帳と更新承認が必要 | ソース由来の設計上の負担。担当者/更新・復旧演習で確認 |
| 互換性/保守 | 任意shellで動かしやすい | 初期POSIX限定、macOSを先行候補とする | 他OSへ自動fallbackしない。Linuxは別適合確認、Windowsは現行同様拒否 |
| 移行/撤回 | 既存コードは変えない | repo内部専用入口を追加予定 | 未実装。撤回は起動を停止し、危険な直接起動への自動切替はしない |

現行entryが想定する空envを構造上作るため、私は案2を推奨する。
端末/OS全体が信頼できない環境では案2も成立しない。その場合は開始せず、別の隔離実行環境を再設計する。
今回は案の承認・実装・配置を行っていない。

## 4. 現在と提案後の信頼境界

現在は「起動環境（信頼条件未強制）→固定entryの事後検査→承認付きlauncher→監督→host」である。
提案後は起動環境とentryの間に次の境界を置く。矢印は提案する依存順で、実装済みを意味しない。

```text
信頼済みOS/端末・運用者
  → 非Node外側launcher［成果物・権限・TTY・dump条件の検査］
  → exec：固定Node + 固定compiled entry + 固定文法の非秘密argv、明示的env={}
  → entry既存検査 → checker → TTY承認 → digest結合監督 → host → OAuth/session/MCP
```

| 変更 | 現在 | 提案後 | 安全性/コスト |
|---|---|---|---|
| 起動設定の所有者 | 外側は運用者の注意に依存 | 固定launcherがNode前に強制 | 継承注入を軽減するが、新しい信頼済み部品が必要 |
| 成果物の選定 | 任意作業ツリーを指定し得る | 承認済みsnapshot・Node・依存閉包に固定 | 起動時検査と更新手順が増える |
| 既存承認/終了経路 | entry内で強制 | 同じ経路を維持 | TTY承認を外側承認で省略しない。71/73の意味を変えない |

## 5. 非公開の起動台帳と成果物

運用者は別承認の非公開起動台帳に、実行UID、OS/arch、固定Node実体の絶対canonical path・version・digest、
固定compiled entry・package root・作業directory、ソースrevision/lockfile・ビルド成果物全体のdigestを保持する。
台帳にはNodeが読み込むpackage.json、依存node_modules、worker/host/checker、動的import先を含む閉包を対応付ける。
entry1ファイルのhashやlockfile一致だけで依存閉包の信頼性を証明しない。台帳自身の真正性・所有者/ACLも検査対象とする。
台帳はOAuth承認manifestと別物で、PDI/client/token設定を上書きできない。

成果物は別工程で検証した固定snapshotを用意する案とし、起動中のnpm install/build/download、npx、tsx、
npm scripts、PATH探索、ユーザー指定loader/moduleを実行しない。稼働中に自動更新しない。
全対象は通常ファイル/適切なdirectory、rootまたは実行UIDの所有、他者書込み不可、付与ACL検査可能を要求する。
台帳・manifestなど非公開ファイルは既存のより厳しい所有者/mode0600条件を緩めない。
Node/成果物のpathは事前確定し、未承認symlink/特殊file/書換可能な祖先/解決先変更を拒否する。
一般のNodeインストールのsymlinkを黙って追従せず、承認した実体と依存ファイルを固定する。

stat/hash検査とexec/import間の競合を完全に消せるとは主張しない。
immutableな配置と更新の排他を前提にし、同一UID/管理者が同時に改変できる状態では開始しない。
実装時はOS別に検査・exec間のidentity保持を試験し、単なるrealpath/hash照合を競合耐性の証明にしない。

## 6. 開始からexecまでの手順案

以下は実装の受入条件であり、現時点で実行できるコマンド一覧ではない。外側の処理も自動実行しない。

1. **事前承認**：起動台帳と承認済み成果物、実行UID/端末、出力/診断方針を非公開記録で照合する。
   runはG2/G4・対象・C設定・発行/復旧条件も必要。check-planはローカル適合確認に限定する。
2. **権限/成果物**：通常の専用利用者権限で固定launcherを開始する。sudo/setuid、権限追加、別Node/別成果物で救済しない。
   自身・台帳・Node・import閉包と祖先のowner/mode/ACL/identityを検査し、未知/検査不能なら停止する。
3. **ローカル実行条件**：専用のcontrolling TTYと入出力の対応を確認する。
   runはstdinとstderrが同じ承認済みcooked TTY、check-planはstderrが承認済みTTYであることを要求する。
   pipe、リダイレクト、raw mode、端末記録/共有・未承認readerがある環境では開始しない。
   他processの全readerを列挙できるとは主張せず、端末専用化の運用確認も必須にする。
4. **FD/環境**：必要なstdin/stderr TTYだけを渡し、stdoutは非保存の破棄先とする案。
   IPCや任意socket/file/token FDを継承せず、許可FD以外はexec時に閉じる。stderrをログファイルへ切り替えない。
   親envを複製してキーを削る方式ではなく、Nodeへ渡すenvを空から構築する。
   NODE_OPTIONS、NODE_PATH、loader/inspector設定、動的loader向け変数、proxy/CA/資格情報の値を転送しない。
   空envにより企業CA/proxy等が必要な環境で接続できなくても、その場で継承へ切り替えない。
   空envでは`PATH`・`HOME`・`TMPDIR`・`LANG`/`LC_*`・`TZ`も渡らない。現行R-2はACL検査を`/bin/ls`/`getfacl`の絶対pathで呼び、
   tmpdir/homedirも使わないため直接の依存は確認していないが、Nodeの既定locale/timezoneは環境で変わり得る。
   OL-03では空envでも表示文言・承認/期限の時刻判定・集計の並び順・summary再投影の一致が変わらないことを合格条件に含める。
5. **診断/資源条件**：子へ継承するprocess単位のcore dump上限0を設定・検証する案。
   Node診断report・heap snapshot・trace/inspector等を起動引数に付けない。OS/端末/EDRの収集運用は別途適合確認する。
   カーネル/共有OS設定や監査を自動変更しない。要求される秘密管理を確認できなければ開始しない。
6. **固定argv**：Nodeには追加flagを付けず、固定entryと`check-plan + absolute manifest path`、
   または明示的`run + absolute manifest path`だけを渡す。shell経由・任意command/moduleは使用しない。
   外側でも固定文法を検査し、未知optionや省略からrunへ昇格しない。token/code/state/verifierは入力にしない。
7. **exec**：固定cwdへ移り、検査済みNodeへ環境とFDを明示してexecする案。wrapperの常駐待機やsignal転送層を増やさない。
   exec失敗は固定の非0終了のみ。例外・path・argv/env・OSエラーテキストを表示しない。
8. **entry後**：既存checker/TTY承認/digest検証を必ず通す。外側はportを先にbindせず、予約・待受検査はlistenerの責任とする。
   port競合時も別port/localhost/IPv6へ切り替えない。ブラウザー起動、URL取得、認可/交換は外側では行わない。

Darwinが空envの子へ追加する`__CF_USER_TEXT_ENCODING`については、現行entryの厳格な形式検査だけを維持する。
これを親の同名値や任意の環境変数を転送する理由にはしない。実OS/Nodeごとの適合は未確認である。

## 7. 終了・秘密・残余リスク

exec成功後はentry自身が同じPIDでsignalを受ける。外側は既知73/71を130や0に変換せず、exit codeの再解釈・自動再試行をしない。
exec前の検査拒否/exec失敗は外側専用の固定結果として扱い、entryのstrict reportがあるとは報告しない。
外側専用の番号はentryの0/10/64/70〜73/80〜82/124/130と重ならない範囲（例：90〜99）から選ぶ案とする。
旧案の拒否64・内部失敗70はentryの使い方誤り/起動条件不適合（64）・fatal（70）と同値で、exec後はentryの番号がそのまま返るため区別できない。
最終値は実装時に固定し、外側/entryの別は引き続き非秘密の実行記録でも区別する。番号だけからcleanupや未発行を推定しない。
exec前/最小bootstrap以前のSIGINT等による既定終了は残る。これを71/73保持済みと扱わない。

非秘密manifest pathも識別情報でありargv/process一覧へ見え得る。pathには氏名・接続先・秘密を入れず、
同一端末のprocess閲覧方針を確認する。認可URL・token・codeをargv/env/ファイルへ移す代替は禁止する。
stdout破棄は秘密流出を全面的に防ぐものではない。stderr TTYのscrollback、録画、OS診断、
bootstrap前のNode/native/loaderメッセージは既存留保として残る。完全非出力が必須で検証不能なら開始しない。

外側launcher自体の起動前loader注入、改ざんされたOS/Node、同一UID/管理者侵害、event loop/OS停止時の絶対終了、
全メモリ消去、サーバーtoken失効は保証しない。信頼済み配備とOS環境の適合を独立した前提にする。
entryの汎用100ms最終化監督は別の未実装提案であり、本設計のexec方式がそれを補うとはしない。
73/71/token unknown時の封じ込めは承認済み担当へ引き継ぎ、未知PIDや共有process groupを停止しない。

## 8. 実装前の作業区分と合成受入条件

| 区分 | 別途承認後の作業 | 合格条件 |
|---|---|---|
| OL-01 | 言語/OS/信頼済みビルド・配備、台帳方式の選定 | 実行ファイルの入手根拠・依存閉包・更新担当・撤回が確定。Nodeによる自己検査だけに戻らない |
| OL-02 | オフライン検査と固定拒否 | owner/ACL/symlink/改ざん/競合/非TTY/dump不適合でNode起動0回、待受/外部通信/任意子0回。固定理由だけ |
| OL-03 | exec接続・FD/環境制御 | fake NodeのOS境界でargv/env/FD/cwd/limitsを照合。起動前注入markerが実行されない。実Node版との適合も確認。空envでの表示・時刻判定・並び順の不変、外側専用exit codeがentryと重ならないことも確認 |
| OL-04 | entryとの合成接続 | check-plan/denyはhost0回、runの承認/変更拒否/ready/summary、signalと終了code不変、秘密非出力 |
| OL-05 | 実PTY/Node下限/実行OS | PDIなしでcooked TTY承認/否認/Ctrl-C/再入力/表示失敗、Node22.12、端末/診断条件を確認。未確認OSへ展開しない |
| OL-06 | G2/G4と運用者レビュー | 実行対象・本人・登録・read ACL・C設定・失効/復旧担当・発行回数が個別承認済み。実manifest配置はさらに別承認 |

起動時間/RSS/FD数はOL-03/04でbaselineと比較し、測定前に性能改善を主張しない。
導入は非公開の合成果物でOL-01〜05を満たしてから、G2/G4を含む実PDI手順へ進む。
撤回時は外側起動を無効化する。実行中のtoken/hostの状態を、ファイルやlauncherを戻しただけで復旧済みとしない。
本設計の初版は実装・試験・設定変更・領域配置を行わない設計案だった。
後続のOL-02はrecord検査、OL-03はgated exec部品を内部実装/合成検証した。
実運用のexec gateは閉じており、署名/配備・領域設定・実Node適合/運用は未実施のまま。

## 9. 承認前チェックリスト

- [ ] 案2の採否、実装言語、初期対象OS/Node、固定runtime/import閉包と更新責任者。
- [ ] 外側launcher自身の安全な起動/配備、OS別ACL・検査/exec競合対策、診断/端末の適合基準。
- [ ] 検査失敗・exec前signal・entry終了・token unknownを区別する非秘密の記録方式。
- [ ] 汎用100ms最終化監督とHS残境界を別途実装するか、どの制限を承認者が受容するか。
- [ ] G0/G1の人の確認、G2/G4、C方式、実manifest配置・実行回数・失効/復旧の個別承認。

未選定事項を設定済み・実装済みとして扱わない。関連する現行状態は
[entry設計](BEST_PRACTICE_BP5_R2_ENTRY_EXIT_DESIGN.md)、
[runner設計](BEST_PRACTICE_BP5_R2_PDI_ADAPTER_RUNNER_DESIGN.md)、
[最小検証計画](BEST_PRACTICE_BP5_OAUTH_MINIMAL_VALIDATION_PLAN.md)に従う。
