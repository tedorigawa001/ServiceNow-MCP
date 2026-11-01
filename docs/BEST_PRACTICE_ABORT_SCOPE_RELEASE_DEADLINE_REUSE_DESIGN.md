# RC-03 R前提：既存deadlineMs getterの再利用契約

Version: br006-release-deadline-reuse-draft-0.6 / Date: 2026-11-01。
Status: **RP-01のprivate projectionを既存の固定fake-200継続だけに限定実装（§8）。実sourceの値判定・比較器接続は未実施。実接続・実通信・実機操作・設定変更・実Permit発行・Pushは行わない。正式発行口閉鎖・Unknown・全体受付無効・VM／監視／telemetry調査保留を維持する。**

設計基準`2e4e841`、RP-01基準`9de9c6a`。[RC-03親設計](BEST_PRACTICE_ABORT_SCOPE_RELEASE_ADOPTION_RC03_DESIGN.md)のR前提を訂正・具体化する。D01〜D03の合成保証を実source／sessionの保証へ昇格させず、既存のgetterを重複追加しない。§5は将来の全体受入条件で、今回の限定実装・検証範囲と残差は§8へ分離する。R差替えの承認ではない。

## 1 現状と訂正

| ソースで確認した事実 | 根拠・限界 |
|---|---|
| `BoundedReadSession.deadlineMs`は既に存在するgetter | [bounded-read.ts](../src/servicenow/bounded-read.ts)の`get deadlineMs() { return this.limits.deadlineMs; }`。setterなし。新しい供給口の実装は不要 |
| limitsはconstructorで既定値をcopyし、検査済みの低減値を反映する | `BOUNDED_LIMITS.deadlineMs=60000`、受理値は整数1〜60000。渡されたoptionsの参照を採用しない |
| 全deadline確定後に開始時刻を採取し、設定をpinする | constructorの順序はlimits確定→monotonic開始→`startedAt`→`pinReviewReleaseConfig(..., startedAt, limits.deadlineMs)` |
| getter／設定pin／canonical core／hard timerは同じlimits値を参照する | getterは全duration、core／timer／`remainingMs`は同durationと元monotonic開始に基づく。getterはremainingを返さない |
| 現行コードのlimitsへの代入はconstructor内だけ | 静的照合の結果。`private readonly limits`はTypeScriptの宣言であり、Recordの各値は実行時deep freezeされていない。改変耐性の証明とは別 |
| 実sourceはまだ既存値判定を使う | [bounded-source.ts](../src/review/bounded-source.ts)の`#observeRelease`。既存getterの存在と、RC-02への接続完了を混同しない |

親設計の旧「sourceから読む口がない」「readonly供給口の新設が未実装」は誤認だった。現在の未実装差分は**既存getterを、同sessionのstartedAt／pin済みpolicyと対にして固定比較器へ結合することと、その検証**である。旧draft-0.2の訂正説明もこの再訂正に置き換える。

D01／D02／D03の過去検証記録にも供給口未実装という表現があるが、それを現在のAPI不在の根拠として使わない。本書で誤認を明記し、過去の実行件数・失敗履歴・承認状態は書き換えない。

## 2 固定値と時間軸

| 記号 | 固定供給元・意味 | 用途 |
|---|---|---|
| S | 同sessionの`startedAt`、構築時の開始UTC | 設定の有効性判定の起点。後のUTCで置換しない |
| L | 同sessionの既存`deadlineMs` getter、元の全duration | 設定pinと比較器の`timing.deadline_ms`に同じ値を使う |
| P | 同sessionのpin済み`releasePolicy` | assertion／issue／bindingをそのまま使う。providerやファイルを再読しない |
| M | sessionの元monotonic開始 | hard deadline・remaining・phase／cleanup枠の既存管理用 |
| O | complete_200の取得後guardに続く観測UTC | 観測証拠の時刻だけ。S／Lや設定expiryの起点にしない |

設定pinも比較器も、設定期限Eに対し`E > Date.parse(S) + L`を有効性の必要条件とする。等号は不足。binding一致時のissueは`E <= S`ならconfig_expired、`S < E <= S+L`ならconfig_validity_insufficient。binding不一致の優先順・asserted_atの整合は既存[設定pin](../src/servicenow/review-release-config.ts)と[純粋比較器](../src/servicenow/review-kernel/release-comparison.ts)を維持する。

これは設定が元run全体をカバーする条件であり、実行中断を実現するtimerではない。実際の期限・取消・closeは既存canonical coreとguardが担当する。残時間はguard／待機の上限にだけ使い、Lを作り直す入力にしない。UTCとmonotonicの相互変換、`Date.now()+remaining`による新しい設定期限、別sessionの値の寄せ集めは禁止する。

## 3 Rの将来の供給・消費契約

1. **供給者を固定**：sourceが既に保持する同`#session`だけを使う。callerのtiming JSON、D用profile／context、任意getter object、公開summary／draftを供給元にしない。public `resolveRelease`へS／L／Pの引数を追加しない。
2. **生成位置**：既存入口guard・親検査後、最初のrelease判断のprivate継続で、同sessionからS／L／Pを一度採取して局所の読み取り専用projectionにする。Lは構築時にpinへ渡した値と同値でなければならない。今回の設計で新しいpublic supplier／registry／friendや全limits公開を加えない。
3. **両経路を一致**：通常GETと既存private ackの200継続が同じ固定入力生成を使う。private経路では既存`check`を、通常経路では`assertActive`を維持し、guardを交換しない。ackの一度限り消費・`releaseRead`・`#decision`のcached promiseを維持する。
4. **比較入力**：固定model、`timing.started_at=S`、`timing.deadline_ms=L`、`policy=P`と同sourceの観測だけを組み立てる。complete_200だけOを含め、not_requestedにはOを入れない。rows／Oの到着時点でS／L／Pを再pin・更新しない。
5. **消費**：比較前後・private採用前の既存guardを通る。純粋比較器は値の整合を判定するだけでsession identityや生存を証明しない。source／session結合・close／失敗後の再利用拒否は元ownerが担当する。
6. **終了**：局所projectionや計算済みdraftを公開の採用handleにしない。失敗／close後に新projection・新promiseを生成して再開しない。既存の解放・first reason・HTTP／cleanup診断を保持する。診断に認証情報・identity handle・raw設定・例外本文を加えない。

getterはsetterなしでも生存検査を行わないため、getter読取だけでguard済みとは見なさない。またgetterの値が同じだけではsession同一性を証明できない。prototype／own propertyの置換等を許す相手まで防御したとの主張はせず、Rで認めるtrusted生成元・不変条件の検査方法を接続レビューで確定する。保証できない場合はRを有効化しない。これを残時間の再計算や新公開入力で救済しない。

## 4 固定失敗と費目所有

| 状況 | 将来の固定扱い |
|---|---|
| 外部options自体が不正 | 既存constructorのinvalid_inputを維持。R用の新しい受理口を作らない |
| trusted内部projectionの型／日時／issue／L整合が崩れる | 先行停止がなければinternal_review_errorで停止。ordinary unknown・fallbackへ変換しない |
| 取消／close／元deadline／phase deadlineが先行 | 元ownerの固定理由を保持。計算済みdraftを採用しない |
| 整合したconfig_binding_mismatch | 既存のdispatch前no-requestを維持。release GET=0。比較器接続で取得してから不一致にする順序へ変えない |
| 比較器がinvalid_input、post-guardも失敗 | guardが保持する先行停止を優先し、内部矛盾で上書きしない |

getter再利用・局所値採取自体でC/G/P・予約・retry・timer・cleanupのownerを追加／交換しない。全60秒・210試行・既存受信上限を維持する。新たな値projection／copy／guardの費用は将来のwork・allocation上界に計上すべき未導出費目であり、本書でUnknownを確認済みにしない。同期処理の強制preemptionも主張しない。

## 5 fake依存での受入条件（未実施）

本番値判定の差替え・Permit発行とは分離し、既存constructor／固定sourceを用いる将来の合成試験とする。比較器やsessionを任意のstubへ置換した結果だけで実class保証を主張しない。

| ID | 条件・独立期待値 |
|---|---|
| DL-01 | 既定L=60000、低減L=10000がconstructorからgetterに一致。L=0／60001／非整数は既存invalid_input。callerの元optionsを生成後変更してもLは変わらない |
| DL-02 | 同SでE=S+L−1、E=S+L、E=S+L+1を設定。前2つはconfig_validity_insufficient、最後だけissueなし。E=Sはconfig_expired。asserted_at>S／E<=asserted_atはconfig_invalid。正常なasserted_atを別途固定する |
| DL-03 | 設定pinのS／Lと、そのpolicyを使う比較入力のS／Lが完全一致。providerの呼出しはconstructorのpin時だけ。fake I/O待機後もLはremainingに減らさない |
| DL-04 | 例：S=04:59:00Z、L=60000、E=04:59:50Z、取得が45秒後でもpolicyはvalidity_insufficientのまま。Lを残15秒に変えた比較はpolicyとの矛盾で拒否。値を再pinして救済しない |
| DL-05 | L=10000の別sessionを作っても、L=60000のsourceへ混ぜない。値だけ同じ別sessionも採用元としない。同source／通常200とprivate ackの入力一致を、それぞれ独立期待値で確認 |
| DL-06 | 親後・採取前／後・取得後・比較後・採用前の取消／close／deadlineを確認。getterがまだ読めても採用しない。先行理由、cached failure、解放・予約返却を保持 |
| DL-07 | binding不一致でrelease GET=0、通常200は追加GET=0、C/G/Pは比較なし経路の独立期待値と一致。reservation／cleanupは一度だけ。同一bytesの再課金なし |
| DL-08 | complete_200のO採取はS／Lを変更しない。[観測UTC契約draft-0.5](BEST_PRACTICE_ABORT_SCOPE_RELEASE_OBSERVATION_UTC_DESIGN.md)のOU-01で固定fake継続の一度限り採取／guardだけを部分確認。通常source／上位reviewed_at／ended_atのR-CLOCK保証は未実施／承認待ち。not_requestedでOを捏造しない |
| DL-09 | 旧0.2／0.3出力、公開可変copyとprivate snapshot、limitationsの順序、native/status-only・非200の既存挙動を変えない。D用root／claim／fake時刻が本番packageに入らない |

試験は元期限を緩めず、実通信・実設定を使わない。D固定値の成功と実classのfake-I/O保証を別集計する。上表は実装・実行前の受入案で、完了件数に加えない。

## 6 次工程・承認待ち

CT-Aで元S／全L／pin済みPを同rows／Oのstrict比較入力へ結合し、非実行候補の一度限り受理をfixed fake継続へ限定追加した。未設定optionalのundefinedだけを値projectionから省き、元P・設定pinや意味判断は変更しない。通常実source採用・上位時刻owner／worker jobへの移譲は未実装で、詳細は接続契約§10に記録する。

既存getterの存在と現在の参照元は静的照合済み。RP-01で固定fake継続のprojection生成／消費と一部の動的検証を追加したが、通常実sourceへの採用・§5全項目の完了は未実施である。新getterや独立deadline設定の追加を先行しない。

B-03の開発専用build／compiled保証・旧case対応表は別工程。既存production compiled試験の成功をD01〜D03の専用compiled保証へ数えない。設定日時長cap・同期比較／全入力work上界・UTC採取方針・実source／Permit切替・friend撤去は依然未承認／Unknown。正式発行口・全体受付は開かず、調査保留を維持する。

[比較器入力・上位時刻の接続契約draft-0.5](BEST_PRACTICE_ABORT_SCOPE_RELEASE_COMPARISON_TIME_BINDING_DESIGN.md)に、消費済みの同projectionを同sourceのrows／O受領物・上位TimeOwner・各worker jobへ結合する案を整理した。S／全L／Pを採り直さず、空200でもOを保持する。TB-A／Bは固定fake継続の移譲／消費と元run停止だけを限定接続し、worker job／T_i／Eへの結合は未実装。RP-01／OU-01の部分保証を全体接続へ流用しない。

## 7 draft-0.1作成時の確認範囲

ソース・現在の設計書・git履歴の読み取り照合とMD更新のみ。getter新設、limitsのfreeze、比較器接続、テスト追加／実行、build、外部資料取得・通信は行っていない。文書の参照・差分検査は別途実施し、その結果だけを報告する。

## 8 RP-01の限定実装・費目・残差

[BoundedReadSession](../src/servicenow/bounded-read.ts)内部に非exportの型と`#private`状態を追加した。constructorの設定pin直後に同this・startedAt・元limits.deadlineMs・pin済みpolicyをoriginとして保持する。既存getterそのものは変更しない。originは通常sessionにも確保するが、通常GET／実sourceの判定からは生成／消費を呼ばない。

既存`prepareNewReviewComposition`の固定fake-200継続で、親ack受理後にfresh→capturingを先に消費し、同sessionの既存getterを一度だけ読む。元origin／同source／composition keyと照合し、guard後の現状態も再確認してからpendingへ進める。projectionは凍結したtiming（S／L）と同policy参照、this／source／keyだけを保持する。getter実行中のstartedAt／policy変更もrelease dispatch前に拒否する。

同継続のrelease-200受理直前にはprojectionをslotから先に取り除いてconsumingへ進み、同this／source／key・origin・現状態を再照合し、guard後にconsumedとする。今回の生成値は整合検査後に破棄し、比較器・実source判定には渡さない。通常のprivate release consumerは従来の判定を使う。新しい公開生成口・friend・projection取得口・summary field・registryはない。

失敗時はprojectionを破棄してclosedにし、同canonical停止ownerへ固定理由を渡す。先行する取消／close／deadlineを内部エラーで上書きしない。同期失効・finally・constructor rollback／closeでもslotを消し、originはcloseで解放する。失敗後に状態やclaimをfreshへ戻さない。固定private継続以外から生成・二重消費を直接起動する試験用入口は追加していない。

追加費目はconstructor origin1個、fake継続のprojectionとtiming各1個、固定参照比較・guardであり、raw設定・policy・bytesの新たなdeep copyはない。C/G/P・final4予約・cleanupは元ownerのまま。allocationの正確なlayout／work／同期時間上界は未導出で、全体受付の根拠にしない。

RP-01時点の記録として、[RP-01検証記録](E2E_BEST_PRACTICE_RELEASE_SESSION_PROJECTION_RP01_2026-11-01.md)に合成試験・初回RED／補強時の失敗・型検査・梱包確認を記録する。§5のうちgetter／pin一致、低減値、options copy、残時間置換、policy混入、guardと停止の一部を実class＋fake依存で確認する。比較器への実入力・取得45秒後のpolicy照合・観測UTCと上位時刻・全§5の保証／B-03専用compiledは残課題。故障注入に使うprototype getter置換は本番の供給口・権限にはならず、任意のローカルコード改変に対する完全防御を主張しない。

draft-0.3では[観測UTC契約draft-0.5](BEST_PRACTICE_ABORT_SCOPE_RELEASE_OBSERVATION_UTC_DESIGN.md)への参照を追加した。取得後guardの後に一度採るOと、構築時のS／全Lは別物。時計失敗・逆行・上位時刻の不整合を時刻補正やpolicy再pinで救済しない。draft-0.4時点ではOU-01の固定fake継続の採取／guardを限定追加したが、上位private UTC保持・比較器入力化・上位結合は未実装で、RP-01に実装済みとは数えない。
