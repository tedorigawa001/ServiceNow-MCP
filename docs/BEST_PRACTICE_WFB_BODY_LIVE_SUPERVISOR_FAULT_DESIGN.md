# WF-B BL-C：親supervisorの故障注入matrix・受入条件

Version: draft-0.2 / Date: 2026-11-14 / 読取り基準HEAD: `8c2e9d7`。レビュー修正基準HEAD: `9817f6e`。

draft-0.1のレビュー修正：§1が「今後確定する」とした判定順について、基準HEADの比較器がすでに旧対照の期限停止を出力超過・stderrより先に`inconclusive`へ分類しており、SF17の併発異常を隠していたことを一時copyの偽childで確認した（stderr 70,000byte・TERM無視でexit 2）。判定を純粋関数へ切り出して順序を直し、ceilingのSIGKILL再送と、timerだけに頼る期限判定も合わせて直した。§1の表を修正後の現状へ更新し、§9に内容と限界を記録した。SF01〜25とgateは変えていない。

Status: **詳細設計のみ。故障注入・実装・再実行は未実施。** 通常経路未切替、正式発行口・C実行入口・body起動閉鎖、全体受付無効、Unknown、VM／監視／telemetry調査保留を維持する。実接続・実通信・設定変更・Pushを許可する文書ではない。

親は[body-live試験見直し設計§5〜7・11〜12](BEST_PRACTICE_WFB_BODY_LIVE_COMPILED_REDESIGN.md)、既存結果は[BL-B検証記録§5・7〜8](E2E_BEST_PRACTICE_WFB_BODY_LIVE_LOADER_BLB_2026-11-13.md)。対象は試験専用の `tests/review/fixtures/compiled-body-live-compare.mjs` と、その将来の合成対照である。製品のworker／session／認証／予算ownerへ接続しない。

## 1 目的・現状との差分

BL-Bで正常ABBAの観測一致・exit／close・所有group不在2回を確認済みだが、それだけではBR09の故障時保証にならない。本設計は、後続の安定3run・通常並列回帰で失敗を採れなかったことを成功や空出力へ誤分類しないための前工程である。

| 境界 | 基準HEADにある機構／記録 | 今後必要な対照・差分 |
|---|---|---|
| 出力 | stdout／stderr各64KiBまでbyte保持、超過後もdrain、正常出力を照合 | 分割・多byte・超過・stream error・未採取を分離して注入する |
| 時間 | spawn直前起点60,000ms、SIGTERM後1秒で必要ならSIGKILL、起点63,000msの外側ceiling。各signalはchildごとに最大1回。close時刻が60,000ms以上ならtimer未発火でも期限到達 | 境界時刻・遅延timer・取消・早期異常後のcleanupを同一状態機械で検証する |
| 終了 | exitとcloseを別採取、group不在2回、未確認なら次childを起動しない | close欠落・子孫生存・照会／signal失敗・重複eventの対照を追加する |
| 判定 | 純粋関数`classifyChildRun`で、cleanup未確認→spawn／signal error→close未観測→出力超過→stderr→期限→exit code／signalの順に判定。旧対照の期限は他の異常がない場合だけcontrol_deadline／exit 2 | 併発する監視異常を比較不能へ隠さない優先順を確定する |
| 進行 | childは旧summary＋BL-B summaryの最終2JSON | 最大22checkpointは未接続。2行契約を暗黙に緩めず、別protocolとして設計・検証する |

現行ではerrorとsignal例外に同じ変数を使うなど、診断軸を完全に独立して検査できる内部契約は未確認。外部取消、早期close後にgroupが残った場合の即時停止、出力超過時の早期停止も、本書によって実装済みとはしない。

## 2 固定の期限・所有範囲

- `t0` は各childのspawn呼出し直前の親の単調時刻。source読取り・変換・import・意味診断・summary／stdio完了を含む実行枠は同じ `D_run = t0 + 60,000ms`。case・event・retryごとに更新しない。
- `now >= D_run` は期限到達。遅延timerより先にcloseが届いても、その時刻が期限以上なら期限内成功にしない。summaryを期限前に得ても、正常closeが期限後なら成功ではない。
- 停止を確定した `t_stop` から新case・次childを開始しない。cleanup終点は `min(t_stop + 3,000ms, t0 + 63,000ms)`。SIGTERMは停止時に所有groupへ一度、1,000ms後も生存が確認されたときだけSIGKILLを一度送る。終了照会がUnknownなら成功扱いせず、無関係なPIDを探索してkillしない。
- 正常close後の確認区間はclose時刻をcleanup起点として同じ最大3秒／起点63秒ceilingを使う。これは取消・失敗理由の発行ではない。group生存やstream異常が判明した時点で初めて停止理由と固定signal責務を確定し、既に始めたcleanup期限を延長しない。
- cleanup枠で許すのはdrain・exit／close採取・所有group照会・固定signal・所有一時領域の処理だけ。assert／emit／importの続行や遅れたsummaryによる成功への復帰は不可。全ABBAが60秒という意味ではなく、各childの実行枠を不変に保つ。
- group不在は独立した照会2回、間隔100ms以上で確認する。成功closeが60秒未満なら、その不在確認だけは有限cleanup枠内で待てる。照会不能・EPERM・pid不明をESRCHと同一視しない。
- 対象は当該親が生成したchildと確認済みの所有group、一時rootだけ。groupから離脱したprocessまで不在と主張しない。実際のOS機構を使う対照は、後続の個別承認なしに起動しない。

時計のthrow／NaN／逆行は監視失敗として固定拒否する。同時計が壊れた後に時間内cleanupを実証したとはせず、外側停止機構の保証は別に確認する。CPU負荷・free memoryだけからclockやmemory pressureの正常を推定しない。

## 3 四軸終端・判定優先順

runごとに `ordinal／mode` を先行固定し、以後のevent・時刻・byte数・signal・照会結果を同runへ結合する。pid・ordinalの使い回しや別runのclose／summaryの採用を拒否する。以下は将来の試験内部の診断契約で、製品の診断schema追加ではない。

| 軸 | 区別する値・観測 | 確定条件 |
|---|---|---|
| 実行 | 未起動／実行中／正常／child失敗／期限／取消／監視失敗 | 最初の原因と観測時刻を保持。後発code 0で上書きしない |
| process | spawnの成否、exitの有無・code／signal、closeの有無・code／signal | exitだけでclose済みにせず、不一致・重複矛盾も失敗として残す |
| stream | listener接続、stdout／stderr別のseen／retained byte、EOF／error、truncated、protocol受理 | 未採取を0byte／空出力にせず、保持とdrain完了を別記録する |
| group | 未生成確認／生存／不在1回／不在2回／Unknown、signal試行と結果 | closeと独立に確定。確認不能時に一時rootを削除せず保持責務を残す |

全体結果は `passed`（exit 0）、`failed`（exit 1）、`inconclusive`（exit 2）の3分類とする案を固定する。取消は `failed` の固定理由として独立保持し、比較不能とはしない。cleanupが未確認ならそれを別の終端失敗として必ず可視化し、最初の実行理由も失わない。

優先順は、監視／protocol／cleanup異常があれば `failed`、それらがなく新経路の期限・child異常があれば `failed`、旧対照だけの期限到達かつ終了確認済みなら `inconclusive/control_deadline`、全4runが正常かつ比較一致なら `passed`。旧対照timeoutに伴う未完了summary自体は当然の未完了として記録するが、出力超過・不正な完成summary・stream error・取消・終了未確認まで免責しない。比較不能で後続ABBAを補完起動せず、その試行を終了する。

故障注入試験の「成功」は、この期待分類と後始末・起動禁止のassertが一致した意味に限る。注入した失敗childを `passed` と報告する意味ではない。

## 4 出力・protocolの有限契約

stdout／stderrは別々に65,536byteまで保持し、65,537byte目からtruncatedを固定する。UTF-8の文字数ではなく到着byteを数え、多byte文字の途中で保持が切れても、切詰め本文を有効JSONへ補修しない。超過後も到着分をdrainして計数し、最初の異常で停止を要求する。seen byte計数は安全整数範囲で飽和＋overflow診断とし、無制限buffer／整数丸めを許さない。stream未接続・errorと、採取済みEOFかつ0byteを区別する。

現行互換protocolでは、stdoutは最終の旧summaryとBL-B summaryの2JSON、stderrは0byte。chunk分割と末尾改行には依存せず、全stream採取後に検査する。空・片方欠落・重複・余剰行・JSON不正・schema不正・304case／385観測／意味拒否19行・digest／順序・隔離結果の不一致は固定失敗とする。期待field・型・件数・許可keyを明示したstrict検査を将来の実装対象とし、現在のassertが全余剰fieldまで拒否済みとはしない。raw例外・source本文・JS・秘密を診断へechoしない。

進行protocolは別工程で版を明示し、親旧protocolが未知版やcheckpoint混入を受理しないことから検証する。最大22件（start1、source／emit完了2、8群開始／完了16、semantic開始／完了2、最終summary1）で、run・群ID・単調時刻・最後の完了case／件数だけを許す。最終1件は既存2summaryを固定payloadとして包む設計で、全22件も各streamの同じ64KiB枠内。checkpointはassert成功・summary・close・group終端の代替ではない。

本matrixの第1段階は現行2JSONで実施する設計とし、22件をまだ出さない。この段階だけでcheckpoint coverageやBR09全完了とはせず、安定3run前に別工程の実装・検証要否をレビューする。

## 5 故障注入matrix

全行は未実施。まずfake clock／process event／stream／group照会で決定的に検証する。参照oracleはsupervisorの判定関数から期待値を生成せず、下表の手書きevent列・期待分類・signal列・起動数・保持byte／終端を基準とする。実childを使う段階は後述の別工程である。

| ID | 注入／対照 | 必須の期待観測・受入条件 |
|---|---|---|
| SF01 | 正常ABBA、stdoutを任意chunkへ分割 | 4child直列、全2summary・比較一致、exit 0／signal null、close・不在2回。signal 0、成功のみ次run可 |
| SF02 | stdout／stderrの64KiB−1・一致・＋1、多byte分割 | 保持各64KiB以下、超過でtruncated・停止、余剰もdrain。stdoutの境界内は容量検査通過だけでsummary成功とはしない。stderrは1byteでも失敗 |
| SF03 | 超過後も連続出力、計数の安全整数境界 | buffer増加なし、取消／signal／ceilingを妨げず終了。飽和を可視化し負数・丸め・成功復帰なし |
| SF04 | listener未接続、片側stream error、EOF未確認 | 未採取／Unknownを保持し固定失敗。0byteの正規空streamと区別する |
| SF05 | code 0だがstdout空／summary1個／未完成JSON | protocol失敗。未完了情報を保存、cleanup確認後も比較成功なし |
| SF06 | JSON不正・余剰／重複行・未知field／型・不正digest | 正常に見える先頭summaryだけを採用せず失敗。入力本文を診断へ再出力しない |
| SF07 | case／順序／観測数／意味19行／isolationだけを変異 | 各要素ごとの負の対照で失敗し、別検査によるmaskを対照成功へ数えない |
| SF08 | 出力を読まず終了を待つ壊れた対照 | 有限pipe容量のfakeで待ちが成立し、正規drain経路なら進行する。実装がdrainを外すとこの対照が失敗する |
| SF09 | exit先行・close遅延／欠落、stdioを保持 | exitだけでは成功・次runなし。閉鎖を待ち、期限／cleanup枠で未確認診断。所有group不在でもstdio未closeを隠さない |
| SF10 | close後も所有group生存 | 直ちに停止／cleanupへ入りTERM→必要ならKILL。不在2回まで次run・一時root削除なし |
| SF11 | spawn同期throw／error、pid未取得／部分取得 | spawn失敗を保持。未生成と証明できる場合だけgroup未生成確認とし、部分生成はUnknown。不存在を推測してcleanup済みにしない |
| SF12 | group照会EPERM／未知error／不在1回後に生存 | Unknown／回数resetを保持、2回不在へ水増ししない。次runなし、root保持 |
| SF13 | TERMで終了／TERM無視しKILLで終了 | signalは各最大1回、KILLは停止1秒後かつ生存時のみ。closeと2回不在を別確認。終了済みgroupへ不要なKILLなし |
| SF14 | signalがESRCH／EPERM、KILL後も終端未確認 | ESRCHのsignal結果だけで不在2回にしない。EPERM・終端未確認を固定失敗に残し、所有外processへ操作を広げない |
| SF15 | 新経路が59,999／60,000／60,001msでclose、timer遅延 | 期限未満だけ時間条件通過。期限以上はcode 0でも失敗、単一deadlineを延長しない |
| SF16 | 旧対照だけ期限、その他の監視・cleanupは正常 | incomplete summaryを未完了のまま、終了確認後にinconclusive／control_deadline／exit 2。残りABBA起動0 |
| SF17 | 旧対照期限＋出力超過／stream error／不正完成summary／cleanup不明 | 併発要素ごとにfailed／exit 1。control_deadlineへ隠さず原因とcleanupを両方保持 |
| SF18 | 起動前／実行中／summary後close前の取消、取消再入 | 起動前はspawn 0、起動後はcleanupだけ。最初の取消保持、signal重複0、遅い正常eventで成功復帰なし |
| SF19 | fake clockのthrow／NaN／逆行、同時期限とclose | 固定監視失敗。event登録順で結果が逆転せず、期限到達以降の成功なし。cleanupの時間保証は未確認として区別 |
| SF20 | error／exit／close重複、別ordinal／pidのevent | 同runの初回終端だけ採用、矛盾は異常保持、二重resolve／次run二重起動／二重削除0 |
| SF21 | cleanup ceiling到達、消滅照会不能 | 実行は再開せず有限に監視終端を記録、未確認group／stdio・保持rootを列挙。親の自然exitをcleanup証拠にしない |
| SF22 | 一時root作成／run準備／削除失敗、部分生成 | 所有範囲だけ処理、失敗位置と残存責務保持。削除失敗を比較成功へ埋没させず、再帰範囲を拡大しない |
| SF23 | 親report出力throw／pipe破断 | 元child診断・停止責務を失わず、次childなし。報告不能を報告成功へ変換しない。必着はUnknown |
| SF24 | 親途中終了・別groupへ離脱する子孫をfake表現 | 自身が完遂していない終端を成功にせず、外側observer／所有境界不足としてUnknown。無関係processの不在証明に拡張しない |
| SF25 | 将来checkpointの未知版／欠落／重複／逆順／23件目／別run | protocol版別に拒否。正規22件以下でも最終2summaryの内容・close・group確認を省略しない。現段階は未接続 |

## 6 試験境界・負の対照

1. **純粋fake**：正規supervisorへ渡す狭い操作境界だけを対象に、有限event列と同一deadlineを使う。event数・照会回数・buffer上界もassertする。親判定の写しを試験するだけの別実装を完成保証にしない。
2. **感度監査**：drainを外す、64KiBを文字数へ変える、exitをclose代用にする、不在確認を1回にする、旧timeoutを無条件で比較不能にする、期限判定をtimerだけにする、次run gateを外す、の個別変異を各SF行が拒否することを要求する。構文／import失敗はkillへ数えない。
3. **将来のprocess対照**：別途承認された場合だけ、専用の小さい合成childを所有一時領域で起動し、pipe圧迫・stdio保持・signal・子孫groupのOS差を独立確認する。実body-liveの仕事や実ServiceNow通信を使わない。fakeの60,000ms境界を短時間で進めても、実childの60,000ms期限を変更して性能受入したとはしない。
4. **親の外側**：親がhard crash／SIGKILLされた場合、親内部のfinallyだけでは解放を保証できない。将来の実process対照には独立した外側所有者・有限監視・子孫終端確認が必要。未承認なら未実施／Unknownのまま残し、親単体の正常終了で代替しない。

操作境界・fakeは配布除外の試験領域だけに置く将来案とし、runtimeへfriend・任意command／URL／env登録口を作らない。fixture台帳を本番ownerへ共有しない。実装前に抽出範囲とexport不変をレビューする。

## 7 受入gate・後続順序

| Gate | 完了に必要な証拠 | 未完了時の扱い |
|---|---|---|
| SG-A | SF01〜24の純粋fake、各失敗分類・四軸・起動数・保持量・所有責務、感度監査 | 機構設計／fakeだけでOS cleanup実証としない |
| SG-B | 承認範囲内のprocess対照、所有group／stdio終端、未確認時の有限停止・外側監視 | 環境非対応はskip成功にせず未確認。BR09全完了を宣言しない |
| SG-P | 版固定の有限checkpoint・SF25、既存2summaryとの対応・64KiB内 | checkpoint未接続を明記。旧2行parserを黙って緩めない |
| SG-C | 上記の確認範囲をレビュー後、同HEAD／依存／Node／起動経路で新経路の独立安定3run | 各60秒未満の正常close・全summary・終端必須、各30秒以下目標。対照失敗を新経路退行へ直結しない |
| SG-D | 通常並列度・期限を維持した全体回帰＋新経路の明示的検証、関連compiled・梱包監査 | 過去のmaxWorkers=3の18,646件成功を今回の受入へ読み替えない |

SG-A→SG-B／SG-Pの未確認を整理→SG-C→SG-Dを優先する。SG-Cで30〜60秒なら機能条件と余裕不足を分け、期限延長せず追加削減の要否を判断する。通常経路切替・旧試験撤去は全gate後も別承認であり、今回の文書作業では行わない。

記録は各SF ID、基準HEAD・Node／依存・起動経路、有限入力event列、期待／実際の分類、t0／停止／exit／close／signal／照会、stream別seen／retained／採取状態、次child起動数、残存責務を残す。未実施を空配列・0件成功にしない。保存先・実採取／保管の追加権限は本書で承認しない。

## 8 今回の範囲・Unknown

新規MDと親設計・BL-B記録への参照だけを更新する。コード・fixture・CHANGELOG・package／lockfile／設定は変更しない。build・合成試験・fault注入・再採取・梱包は未実行。文書整合の確認は故障時の動作実証ではない。

OS別のprocess group／signal／stdio挙動、親hard終了時の外側回収、group離脱、物理allocation／GC／OOM／診断必着、停止後heap退役、実E／S／全体work capはUnknown。loaderのfinishにおける観測0件caseの独立対照も別残課題で、本supervisor matrixの成功で代替しない。正式発行口閉鎖・全体受付無効・調査保留を維持する。

文書整合として、本書と親2文書のローカルリンク11件・表16個の列数、SF01〜25の一意連番、末尾改行・差分空白を確認した。変更は新規MD1件と参照追記2件だけであり、実装・試験の成功やBR09完了を意味しない。コミット・Pushは未実施。

## 9 draft-0.1のレビュー修正（2026-11-14）

基準HEAD `9817f6e` の比較器は、旧対照childの期限停止を、group終了確認の直後、出力上限・stderrの検査より前に`inconclusive`として返していた。一時copyで、SIGTERMを無視しstderrへ70,000byte書く偽childを期限2秒で動かすと、`truncated: true`のまま`control_deadline`／exit 2になった。これはSF17の禁止する隠蔽であり、`8c2e9d7`で比較不能の分類を導入した際に生じた。

| 修正 | 内容 | 確認 |
|---|---|---|
| 判定順 | `tests/review/fixtures/body-live-compare-verdict.mjs`の純粋関数へ切り出し、cleanup・spawn／signal error・close未観測・出力超過・stderrを期限より先に判定 | 手書き報告の単体14件。修正前の順序で8件がRED、修正後に全件成功 |
| 期限判定 | timerの発火に加え、close時刻60,000ms以上も期限到達（新経路は失敗、旧対照は比較不能） | 59,999ms通過、60,000／60,001ms拒否 |
| signal | 各signalをchildごとに最大1回とし、ceilingが先行SIGKILLを再送しない | 一時copyでTERM無視の偽childに対しSIGTERM 1回・SIGKILL 1回 |
| 一時領域 | spawn／signal errorがある場合は親一時rootを削除しない | コード上の変更。故障注入での確認は未実施 |

修正後の同じ一時copyは`failed`／`child_output_truncated`／exit 1、stderrなしでSIGTERMを無視する偽childは`inconclusive`／`control_deadline`／exit 2となった。これらの偽childは一時copyで期限だけ短縮したレビュー用の確認であり、リポジトリの試験ではない。§2・§6の方針どおり、OS processを使う対照はSG-Bの承認後に行う。

単体試験は判定関数の写しではなく手書きの報告と期待値を使う。ただし判定関数とsupervisorのevent採取（exit／close・byte計数・group照会）との結合は、正常ABBAとレビュー用一時copy以外では検証していない。SF01〜25の純粋fake（SG-A）、取消・早期停止・checkpointは未実装のままで、この修正をBR09やSG-Aの完了とはしない。60秒期限、通常経路未切替、正式発行口閉鎖、全体受付無効、Unknown、調査保留を維持する。
