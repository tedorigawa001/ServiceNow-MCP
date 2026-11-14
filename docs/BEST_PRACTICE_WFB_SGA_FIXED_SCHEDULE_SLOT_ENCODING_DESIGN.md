# WF-B SG-A後：固定schedule・最小field／slot形状・encoding確定点

Version: draft-0.3 / Date: 2026-11-14 / 読取り基準HEAD: `8d48bfc` / レビュー修正基準HEAD: `e058407`、`8b21ff9`。

draft-0.2のレビュー修正：FS08未到達の早期失敗で行う診断batchの途中でrecord jが失敗した場合に、TERM encoding（FS14）とz_postを行うかが未記載だった。§6で、FS08のrecord j失敗と同じくbatchを停止し、zとTERM封印までを行ってFS14とz_postは行わないと明記した。回数候補・選択状態は変えていない。

draft-0.1のレビュー修正：回数・式の誤りはなかった。§4がencodingをFS08／14に限定すると書く一方で、§6はFS08未到達の早期失敗の診断batchをFS13のz前に置いており、FS13の費目にOP13がなかった。またFS08失敗時の「TERM試行もskip」が封印とencodingのどちらを指すか曖昧で、§4の「FS13〜14へ合流」とも合わなかった。早期失敗の診断encodingをFS13とOP13に明記し、FS08失敗ではzとTERM封印までを行い、TERM encoding（FS14）とz_postは行わないと統一した。回数候補・選択状態は変えていない。

Status: **詳細設計のみ。LOAD6／LOAD7の選択・本schedule・field／上限の採用は未承認。** 元のtest 5,000ms・既定並列度、通常経路未切替、正式発行口・C実行入口・body起動閉鎖、全体受付無効、Unknown、VM／監視／telemetry調査保留を維持する。実装・負荷採取・試験再実行・実process対照・実接続・実通信・設定変更・Pushは行わない。

親は[provider／clock・操作費目設計§5〜7](BEST_PRACTICE_WFB_SGA_PROVIDER_CLOCK_COST_OWNERSHIP_DESIGN.md)と[鮮度・時間配賦設計§2〜7](BEST_PRACTICE_WFB_SGA_FRESHNESS_HANDOFF_BUDGET_DESIGN.md)。既存の[14／15recordと容量候補](BEST_PRACTICE_WFB_SGA_START_LOAD_CAPTURE_DESIGN.md)を入口とし、recordの確定順・encoding試行数・境界clockの候補回数を対にする。実装coverage・work／wall時間・allocation上界の完成ではない。

## 1 分離する二つの確定境界

起動前に必要な値と、起動直前／後でしか分からない値を一つの可変JSONへ詰めない。次の二段階を本書の候補とするが、profile選択や旧schemaの差替えは行わない。

- **PrePacket**：header、S0〜S5、LOAD7だけL、5 interval、summary。固定値として封印・encodingした後、一度だけ上位へ通知する。上位receiptはこのpacketだけへの受理である。
- **HandoffTerminal**：receipt結果、h／g／i等の時刻・停止／失敗・試行有無のsnapshot。samplerの起動前受渡しが解決した時点で一度封印する。runner／worker／stdio全体の終端証拠ではない。

PrePacketへ将来のreceipt成功・g／i・最終総費用を含めない。terminalへ自身のencoding成功・その後の受領／解放成功を含めない。「結果を書いてから、その結果を含むJSONを再生成する」という循環を作らない。後から判明した失敗は先行ownerの固定診断へ保持し、封印済みrecordを修正・再encodingしない。

## 2 最小のrecord形状とwriter

以下は必要fieldの組とslot対応の案で、完全なstrict schemaやencoded byte上界ではない。enumの全variant、各文字列長・整数桁数・誤差表現・参照数等の確定と検算は後続に残す。

共通fieldは`schema_version`、`record_kind`、固定`slot_id`、同trial／plan／pin／profileへの参照とする。未選択は未選択として設計欄に残し、実行時に都合のよいprofileを推定しない。各値は`ok`と非okのvariantを分け、非okに正規valueを置かない。欠測を0／空値で埋めず、`not_applicable`と`not_started`を区別する。

| slot | LOAD6／LOAD7 | 最小field群 | writer・封印点 |
|---|---|---|---|
| H | 1／1 | 版・identity、provider／clock参照、証拠区分S／F／R／A、a／予定schedule、要件／予約参照 | TrialOwner。arm後に固定し、PrePacket封印時までに検査。将来時刻を入れない |
| S[k] | 6／6 | k、予定時刻、実read前後mono、相関UTC、C／N／load／memoryのvariant、CPU入力検査状態 | SamplerOwner。各sampleのprojectionと局所検査後に封印 |
| L | 0／1 | read前後mono、UTC、N／load／memoryのvariant、固定理由 | SamplerOwner。LOAD7の一度限り取得後に封印。CPU counter／新busyなし |
| I[k] | 5／5 | 隣接index、区間状態、U／T整数pairまたは欠落理由 | SamplerOwner。対応する差分の検査後に封印 |
| SUM | 1／1 | 5区間の状態・busy pair、metric／scope不足、**PrePacket封印前**の計数・予約参照 | SamplerOwner。全必須slotの検査後に封印。h／g／i・最終encoding成否なし |
| TERM | 1／1 | packet受理状態、時刻variant h／g／i／封印時z、試行0／済み／未確認、最初の理由、封印前計数、未受理／未解放責務 | TrialOwner。受渡し解決後のas-of-z snapshotとして封印 |

S[k]にはraw CPU配列を保存せず、二面scratchから項目別検査・区間集計を行う。全sampleのraw配列を後でまとめて比較する配置へ変えない。slot順はH→S0〜S5→L（LOAD7のみ）→I1〜I5→SUM→TERMで固定し、実callback到着順やsort／dedupで並べ替えない。

PrePacketはLOAD6で13record、LOAD7で14record、TERMを含む全体は14／15recordという候補になる。これはrecord分類を維持する案であり、追加field込みの32KiB適合を示すものではない。

## 3 先行保持slotと所有境界

| 内部保持 | 最小の役割 | 固定条件・未確認事項 |
|---|---|---|
| Control | 同owner identity、phase、停止、開始／通知／封印claim | 先行生成。一度限りの遷移。state変化を無制限履歴にしない |
| Timing | a、sample境界、入場点、h／g／i、z／z_postと各状態 | 固定indexへ一度記録。欠落／例外はvariant。追加時計のretryなし |
| Failure | 最初の理由・発生step・二次故障の有限bit／状態 | packet／TERMのencoding前から保持。先行理由を後続例外で上書きしない |
| Receipt | 同PrePacketのopaque参照、通知開始／未受理／受理／失効状態 | 送信だけで受理としない。receipt copy・別trial・再入を拒否 |
| CPU scratch | 前／現在の二面、C≤256・5bucket候補 | logical payload20,480byte。native／JS allocation上界ではない |
| Record cells | H／S／L／I／SUM／TERMのdraft／sealed状態と必要な参照 | 未公開draftとsealed入力の同時保持、参照aliasも後続容量表で数える |
| Encoding workspace | 一度に1recordの出力または失敗途中のbuffer | 失敗bufferを保持したまま次のencodeを始めない。実一時allocationはUnknown |

各recordの成功bytesは固定配列の同slotへ保持する。元のsealed入力・上位への借用参照・成功bytes・失敗途中bufferが同時に存在し得るため、単にrecord数を足した値をmemory上界としない。受領側のcopy有無やencoder内部の一時copyも未実証である。

上位へ渡すのは封印済みPrePacketだけで、Timing／Failureの可変fieldやraw scratchを渡さない。同packetの受理後に元slotの解放を許す場合も、同identity／receiptと未確定TERMのownerは残す。通知throw／ack欠落では元payloadと責務を保持する。packet受理をTERM完了・全体cleanup完了へ昇格させない。

## 4 固定schedule候補

段階IDは設計上の有限stepであり、現時点の実行入口ではない。原起点・既定並列度・test期限を変更せず、getter／sample／L／通知／encodingのretry、catch-up、期限再計算を行わない。

| ID | 固定処理 | record／責務の変化 | 親の費目対応 |
|---|---|---|---|
| FS00 | root・診断・保持／encoding slot・pin／予約の先行準備 | 部分生成でもFailure ownerを先に確保。実pinは別承認のまま | OP00〜02、arm前 |
| FS01 | arm clock aを一度採取し予定・期限を固定 | Hのa／pを固定。Hはまだencodingしない | OP03 |
| FS02 | k=0〜5の各予定slotへ一度入場しnS[k]で停止／遅延を確認 | 拒否なら以後getterなし。未開始slotを固定variantへ | OP04／15 |
| FS03 | S[k]の前mono→固定getterとUTC→後mono | S[k]をprojection。前後monoの間に全取得を収める | OP05〜08、各sample取得費 |
| FS04 | k≥1なら前／現在scratchの項目別差分、I[k]固定 | 正常prefixを維持。CPU集合・epoch不足を推定補完しない | OP09 |
| FS05 | S5後のnAで入場、全5区間集計・最終projection | H／S／Iの不足を確認。LOAD6ではR、LOAD7ではQ | OP10／12／15 |
| FS06 | LOAD7だけnLで残予約を確認、固定Lを一度取得 | Lを封印。LOAD6はこのstepとnLを実行しない | OP11／15、l／Lmax |
| FS07 | SUMを作り、全PrePacket入力を一度封印 | 以後PrePacketのfield不変。g／i等を後付けしない | OP12、R |
| FS08 | 固定slot順で各PrePacket recordを一度encoding | 成功bytes固定。最初の失敗でbatch停止、再試行なし | OP13、R |
| FS09 | nNで残予約を確認し、一度だけ上位へ通知 | Receiptを先にpending化。応答／取消／期限の一度限り合流へ | OP14／15、R |
| FS10 | 最初のsettleでnAckを一度採取し同receiptを確認 | 正常受理時だけ同じ値をhとして採用。timeout／不正応答でhを捏造しない | OP14／15、R |
| FS11 | gで最終pin／停止／鮮度／T予約guard | D_parent・strict D6・必要なinclusive期限を別に検査 | OP16／15、R終端〜T |
| FS12 | 固定call入口のi観測と試行分類の境界 | callは将来案のみ。試行済み／時刻未確認を0へ変換しない | OP17／15、Tと起動後を分離 |
| FS13 | 正常／拒否／throw／取消の受渡し結果を合流、zを一度採取 | 未開始slot・責務を固定、TERMをas-of-zで一度封印。FS08未到達の早期失敗だけ、z前に診断batchを最大一度encoding（§6） | OP18／19／15、早期失敗時のみOP13、sampler終端 |
| FS14 | TERMを一度encodingし、z_postを一度観測 | 封印後の成否・遅延はControl／Failureへ。TERMへ追記しない | OP13／15／19、固定終端費 |

FS02〜04だけが固定6回／5回の反復であり、他は分岐ごとに最大1回の候補とする。FS08は固定13／14recordの走査である。進行前の停止や失敗時は後続の正常stepを飛ばし、FS13の終端へ一度だけ合流する。FS14はTERM encodingを試行できる分岐だけで行い、FS08で失敗した分岐ではFS13のTERM封印で止める（§6）。失敗した通知や最終guardを起点にFS05へ戻らない。

Hをarm前にencodingしてaを後付けしたり、S0より前にheader encodingを挟んでその費用を隠したりしない。本案ではrecordのencodingを、正常経路のFS08／14と、FS08未到達の早期失敗だけが使うFS13のz前の診断batch（§6）に限定し、S0〜S4ではprojection・局所検査・差分だけを行う。この選択は**Rに全PrePacket encoding費を計上する未承認候補**であり、特にLOAD7の返却後100msに収まる実費根拠はない。収まらなければ未適合とし、実行中に前半encode方式へ切り替えない。

## 5 境界clockの有限観測点候補

frame取得内のclockはSのmono12＋UTC6、LOAD7だけLのmono2＋UTC1で従来の48／55取得に含まれる。追加観測を下表へ閉じる案とし、残時間をpollするclock loopを追加しない。

| 追加の観測点 | LOAD6 | LOAD7 | 記録・失敗時 |
|---|---|---|---|
| a | 1 | 1 | OP03。一度のarm読取。S0のb0と同一視しない |
| nS[0〜5] | 6 | 6 | getter直前bSとは別の入場観測。各slot一度 |
| nA | 1 | 1 | 集計・最終projection前 |
| nL | 0 | 1 | L開始前の予約受付 |
| nN | 1 | 1 | PrePacket encoding後・通知前 |
| nAck／h | 1 | 1 | 一度限りsettle観測。別々にclockを呼ばず、hの成立条件を分ける |
| g／i | 2 | 2 | 異なる二つの境界。値をcopyして同じ時刻にしない |
| z／z_post | 2 | 2 | TERM封印前／encoding試行後。自分の観測成否を再encodingしない |
| 追加clock試行上限候補 | 14 | 15 | 未到達点はnot_started。clock throwも1試行として保持 |

したがって列挙したlogical getter／clock試行は正常経路でLOAD6 `48＋14＝62`、LOAD7 `55＋15＝70`という候補になる。armの1回はOP03、残り13／14回はOP15へ置き、二重計上しない。これは対象scheduleの列挙数であって、pin scan・timer登録／取消・演算・encoding・通知・外側ownerのclockを含む全操作数ではない。既存文書の48／55回を誤りとして上書きしない。

getter・通知の実行中取消は先行停止scalarへ一度記録するだけで、新しいclock採取を始めない。通知の正常応答／取消／期限は固定settle slotへ合流し、最初のsettleだけnAckを使う。後着／重複通知は新しい時刻・record・通知・再settleを作らず、有限な重複状態を保持する。これは外部から無限に届くcallback自体のCPU費を制限できる証明ではなく、providerの配送契約・timerの固定登録数・終了ownerの実装coverageは未解決のままである。

時計故障後は再採取せず、z等も安全に評価不能ならmissing／invalidのままとする。timerが動かなければnAckが必ず得られるとは主張せず、外側ownerの未確認責務へ渡す。追加の観測点が必要だと判明した場合は別版で回数と費用を再計算し、実行中に上限を増やさない。

## 6 封印・encoding claimと失敗prefix

各recordは`draft → sealed → encoding → encoded`、encoding例外なら`encoding → failed`という一方向の状態案とする。encoding claimはencoder呼出し前に消費し、throw・部分出力でも未消費へ戻さない。sealed入力とencoded bytesは別であり、成功bytesがないrecordを空JSONで埋めない。

| 位置 | 固定処理 | 保持するもの |
|---|---|---|
| sample／差分取得の途中失敗 | 後続取得を停止。未開始slotを非okで固定し、FS13へ | 取得済みprefix・scratch責務・先行理由 |
| FS08へ未到達の早期失敗 | 上位通知なし。封印可能なPrePacket診断を同固定batchで最大一度encodingする終端分岐案 | 未受理payloadと不足。正常経路のFS08と二重実行しない |
| FS08のrecord jで失敗 | そのbatchを停止。未試行suffixを保持し、上位通知なし。FS13でzを採取しTERMをas-of-zで封印するが、TERM encoding（FS14）とz_postは行わない | 成功bytes prefix・sealed入力・失敗buffer・未試行record、`sealed`のままencoding `not_attempted`のTERM。workspaceが未解放のまま次を作らない |
| 通知throw／取消／ack欠落／不正receipt | 正常stepを停止しTERM封印へ。再通知なし | 元PrePacket・受理未確認・同ownerの先行理由 |
| TERMの生成／封印失敗 | TERM encodingなし | 先行Failureと部分TERM。rootを「記録できたので解放済み」としない |
| TERM encoding／z_post異常 | TERM再生成・再encodingなし | 成功したTERM bytesまたは部分buffer、封印後の成否、未解放責務をownerに保持 |

早期失敗分岐のPrePacket診断encodingはFS13のz前に配置し、その費用を失敗終端へ割り当てる。失敗時だけ新しい「予備JSON」を追加しない。workspace確保・出力上界・停止予約を満たさない場合はその試行も行わず、先行ownerに未encoding状態を保持する。encoding完了を、保存済み・上位受理済み・cleanup済みの証拠にしない。診断batchの途中でrecord jが失敗した場合はFS08のrecord j失敗と同じ扱いとし、batchを停止して未試行suffixを保持する。zの採取とTERM封印は行うが、TERM encoding（FS14）とz_postは行わない。

失敗時のslot確定は、同ownerの終端writerが未封印の空fieldを非ok variantへ閉じるだけである。既に封印した正常prefixを変更せず、getterを再実行したり欠測の実値を補ったりしない。部分取得中のdraftは値検査済みのokへ昇格せず、元slot／scratchの未解放責務とともに保持する。TERM encodingを試行しない分岐ではz_postもnot_startedとし、新しい終了観測を追加しない。

全recordのencoding試行上限はLOAD6 14／LOAD7 15の候補で、正常経路はPrePacket 13／14＋TERM 1。途中失敗ではこれ以下のprefixとなる。再入・重複・取消で消費したclaimは復元しない。一度も呼ばれていないrecordを`failed`へ書換えず、`not_attempted`として区別する。

## 7 終端snapshotと公開／保持の限界

PrePacket receiptは封印済みpacketだけへの一度限り受理で、sampler全体の完了receiptではない。TERMは同packet identityと同ownerへ結合するが、異なる確定時点の別recordである。packet受理前／後の診断と解放責務はrootが保持する。

TERMの意味は「zまでに確認できた受渡し状態」である。z_postやTERM自身のencoding／解放成否、後から判明するcleanup結果は含まない。`counts_at_seal`等も封印前prefixを指し、最終総費用と称さない。成功bytesがあっても後続ownerが失効したら有効な完了証拠へ昇格しない。

z_post後に判明した停止も先行Control／Failureの有限fieldへ保持し、TERM bytesはその過去snapshotのままにする。全責務を手放してよい条件・上位への最終custody移譲は未接続であり、未解決のままならownerを完了扱いしない。外部summaryから正規receipt／証拠を再発行する入口は設けない。

gが期限内でもiの実callとの対応が未確認なら`timing_unconfirmed`とする。iのclock観測とnative callとの間を実時間上界で保証したものではない。call済み・試行有無未確認を0へ遡及修正せず、子ready／worker clockをiの代用にしない。strict D_parent／D6・inclusiveなL返却後100ms等の区別と、実getter費／clock誤差／TのUnknownは維持する。

## 8 今回具体化した範囲と後続の有限保持

今回の回数候補は、record14／15、encoding試行最大14／15、追加clock最大14／15、列挙getter／clock62／70である。これらは採用未承認のscheduleからの構造的検算で、実費・任意負荷での期限内成功・全操作coverageを示さない。

次に必要なのは各fieldのstrict variant・長さ／桁数、確認ID／診断bitの固定集合、snapshot内の時刻参照数、draft・成功bytes・部分buffer・受理前後参照の最大同時保持、encoder内部workと一時allocation、timer／通知／解放費の対応表である。旧25,088／27,136byte・共通32KiB・raw二面20,480byteを総memory保証へ流用しない。pin scanや外側終了ownerの費用も別の未導出費として残す。

本案を選択するなら、全encodingを最終Rへ置く費用と鮮度要件の両立が必要である。実費を確認するための採取は別承認であり、今回の設計をその承認にしない。親profileの切替・要件値の承認・通常経路の変更も行わない。

## 9 後続の独立fake／oracle受入案（全て未実施）

| ID | 対照・故障 | 必須の関係 |
|---|---|---|
| SE01 | LOAD6／LOAD7の正常固定列 | PrePacket13／14・全record14／15、固定順・L有無が一致 |
| SE02 | arm後のH・各sample・SUMへの後書き要求 | 封印前のみwriter有効。h／g／iをpacketへ後付けしない |
| SE03 | 正常取得数＋全追加観測点 | 48＋14＝62／55＋15＝70。aとnAck／hの二重計上なし |
| SE04 | 全recordを一度encoding・二重／再入／取消 | 試行最大14／15。消費済みclaim復元・再encodingなし |
| SE05 | FS08の各jでthrow・部分出力 | 成功prefix・失敗buffer・未試行suffix／TERMを保持。次workspaceなし |
| SE06 | 早期取得失敗・FS08未到達／既到達 | 診断batchを最大一度。正常FS08と二重実行しない |
| SE07 | ack欠落／通知throw・重複／late応答 | 同slotへ一度settle。再clock・再通知・event列追加なし |
| SE08 | zでTERM封印後のencode失敗／z_post異常 | 自己成否をTERMへ追記せず、root Failureへ保持 |
| SE09 | packet受理済みだがTERM未生成／失敗 | sampler全体の完了とせず、残るowner／責務維持 |
| SE10 | Rのencodingが鮮度／予約に収まらない | spawn前拒否。前半encode切替・再L・起点変更なし |
| SE11 | clock throw・guard後遅延・call入口未確認 | 追加採取で補完せず、試行0／済み／未確認を分離 |
| SE12 | 旧byte cap・slot数だけを根拠に総memory成功扱い | 追加field・重複参照・部分buffer・native allocation不足をUnknownに残す |

oracleは固定のrecord ID列・clock観測点列・失敗indexごとの期待prefixを独立に持ち、対象のschedule／counter helperを流用しない計画とする。実装・合成テスト・実process対照を追加／実行したものではない。

## 10 未承認事項・今回の範囲

- [ ] LOAD6／LOAD7と、本固定schedule／record確定方式の選択。
- [ ] 最終Rへのencoding費・観測点・停止／失敗分岐の費目coverage。
- [ ] 最小fieldのstrict化・追加field込みbyte上界・最大同時保持。
- [ ] provider／clock品質・実費・通知／timer／終了ownerの確認方法。
- [ ] 合成受入・実確認・保管・実行の個別承認範囲。

全て未承認。今回の変更は本MDと親2文書の参照更新だけ。選択未承認、元の5秒期限・既定並列度、各閉鎖条件・全体受付無効・Unknown・調査保留を維持する。実装・負荷採取・試験再実行・実process対照・実接続・実通信・設定変更・コミット・Pushは行わない。

文書整合として対象3文書のローカルリンク12件・表20個の列数、FS00〜14／SE01〜12のID連番、未承認チェック5項目、PrePacket13／14・全record／encoding試行14／15・追加clock14／15・列挙取得62／70の定数式、末尾改行と差分空白を確認した。文書と定数の静的検算のみで、実装・合成試験・負荷採取・試験再実行・実費／容量上界の実証ではない。

## 11 後続のrecord別strict field・固定encoding（2026-11-14）

[record別strict field契約・固定encoding規則draft-0.1](BEST_PRACTICE_WFB_SGA_RECORD_FIELDS_ENCODING_DESIGN.md)で、共通scalar・variant・exact key、opaque参照と相関label、hのn_ack参照、ASCII限定の候補出力規則とbyte式を具体化した。FS08失敗時のsealed／未encoding TERMと自己成否非追記を維持し、record最大byte・総量・最大同時保持は未計算のまま残す。選択・format／値域は未承認、元5秒・既定並列度・各閉鎖条件・Unknown・調査保留を維持し、実装・採取・再実行は行わない。

## 12 後続のrecord長の保守算定（2026-11-14）

[variant別byte積上げ・保守上界と合法最大の区別draft-0.1](BEST_PRACTICE_WFB_SGA_VARIANT_BYTE_BOUND_DESIGN.md)で、完成record lineのU_indと一部制約付きU_relを整理した。FS08／13／14の封印・失敗prefixを変えず、未encoding TERMや部分bufferを完成wire長だけで保持不要としない。合法最大・総量・最大同時保持・実allocation／費用は未確定のまま、選択未承認・各閉鎖条件・Unknown・調査保留と実装／採取／再実行未実施を維持する。

## 13 後続の出力予約・部分write境界（2026-11-14）

[packet総量の保守算定・部分bufferの予約境界draft-0.1](BEST_PRACTICE_WFB_SGA_PACKET_TOTAL_BUFFER_RESERVATION_DESIGN.md)で、固定record順に対応する出力予約と、workspace→同backingの成功slot昇格・failed_heldの保持を具体化した。FS08失敗時のTERM封印／FS14未試行を維持し、未使用予約で次encodingを再開しない。最大同時保持・退出確認・実allocation／費用はUnknownのまま、選択未承認・各閉鎖条件・調査保留と実装／採取／再実行未実施を維持する。
