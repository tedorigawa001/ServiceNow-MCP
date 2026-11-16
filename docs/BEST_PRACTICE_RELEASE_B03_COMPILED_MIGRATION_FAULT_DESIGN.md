# B-03：compiled移行・import分離・故障条件表

Version: release-b03-compiled-migration-fault-draft-0.3 / Date: 2026-11-16。
Status: **BG01のLM01／02のみ限定実装・検証（§10）。LM03以降・専用artifact・切替は設計段階。** 旧試験・期待値を維持し、AP01〜06の非提供／保証低下／互換変更は未承認のまま。通常経路未切替、正式発行口閉鎖、C実行入口／body起動閉鎖、全体受付無効、Unknown、VM／監視／telemetry調査保留、LOAD6／LOAD7選択未承認を維持する。friend撤去・build設定変更・負荷採取・実process対照・実接続・実通信・実機操作・設定変更・公開・Pushは行わない。

## 1 基準・目的・現行の不足

基準HEADは`5348e38e6ba646106d13d107155577d1373525ef`。[保証回復レビュー](BEST_PRACTICE_RELEASE_GUARANTEE_RECOVERY_SCOPE_REVIEW.md)RV12／14と[EF-03B計画](BEST_PRACTICE_ABORT_SCOPE_DEVELOPMENT_ROOT_EF03B_DESIGN.md)§5〜6を具体化する。[case別台帳](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md)の分類は変更しない。

| ID | 現行artifact／接続 | 静的確認した不足 |
|---|---|---|
| CE01 | [旧ND module](../src/review/abort-scope-evidence-native-diagnostic.ts) | 純粋診断・注入workflow・fault runnerと、実classのfriend取得・bridgeが同じmodule。単体だけimportしてもmodule評価時にfriendを取得する |
| CE02 | [compiled ND-01](../tests/review/fixtures/compiled-native-status-diagnostic.mjs) | 旧moduleの4export一致と固定8scenario等を検査する。sourceの43受理scenarioすべてをcompiledで確認するfixtureではない |
| CE03 | [compiled ND-02](../tests/review/fixtures/compiled-native-diagnostic-workflow.mjs) | 403／404×body有無、4つのprovenance fault、401＋cancel拒否等。旧UN62行のissue／pre／post・scheduler等の全条件は未収録。`consume_twice`はsourceの受理faultだが本fixtureの4fault列挙には入っていない |
| CE04 | [HTTP pack](../tests/review/package-http-classification.mjs) | 非同梱moduleもリポジトリのdistから実行する。これをtarball内の本番class保証や新開発assemblyのcompiled保証と同一視しない |
| CE05 | [canonical pack](../tests/review/package-canonical-budget.mjs) | fake I/O moduleの同梱を要求し、旧classのsynthetic ack fixtureを実行する。撤去時に期待を分離しないと検査自体が旧入口を要求し続ける |
| CE06 | [tsconfig](../tsconfig.json) | rootDir=src、outDir=dist、tests除外。開発rootをそのままsrcからimportすると本番入力やrootDir境界へ混入し得る。専用build未作成 |

単体・開発assemblyのcompiled化は、正式binding・実認証・実通信の証拠ではない。旧fixtureを先に消して成功件数を維持する方式は禁止する。

## 2 importと所有権の分離境界（配置案）

下表は最小抽出の責務であり、全workflowを新本番kernelへ昇格する案ではない。LM01／02は§10で作成したが、LM03以降の新規名・artifactは引き続き案である。`abort-scope-evidence*`の現行非同梱方針を維持し、本番rootが以下の試験専用層をimportしないことを別途検査する。

| ID | 配置／責務の案 | 固定する境界 |
|---|---|---|
| LM01 | `src/review/abort-scope-evidence-native-diagnostic-state.ts`：固定3purposeの状態、理由、attempt、copy／seal | session・friend・Response／Streams・clock・timer・I/O importなし。creatorごとに新規binding／writerを保持し、公開診断から復元しない。210 ordinalは既存状態上限で、新しい可変traceを足さない |
| LM02 | 同系列の`native-diagnostic-pure-fixture.ts`：固定43scenarioのdata-only runner | scenario名だけを受け、元のstrict拒否・trap非実行・固定診断を維持。writer／binding／callback／sessionを引数や結果へ出さない。LM01と同じ実装関数を使い、旧返値をoracleとしてコピーしない |
| LM03 | 同系列の`native-diagnostic-injected.ts`：bridgeなしの注入workflow・固定fault runner | 同reader・元window／floor、issue／consume・cleanup／sealを所有。既存NativeInput相当のfake budget／schedule以外に、実session／consumer／scope／bridge／登録callbackの受付を追加しない。旧NDとSTを混ぜず、provenance台帳は各realmの私有物にする |
| LM04 | 元ND module：移行中だけの旧compat root／実class bridge | LM01／02の共通部分を利用して旧入口を保つ。実class bridgeはこの旧rootだけに残し、LM01〜03へ後付け登録するinstaller・singletonを作らない。EF-03Cの別承認までは旧取得・旧試験を維持 |
| LM05 | `tests/support/review/ef03/`：既存assemblyと試験用固定driver | 自分のfresh rootだけを作る。LM03のunit realmと既存ST cleanup realmも別台帳として扱う。Dの値summaryを旧ND終端やPの証拠として採用しない |

**bridge分岐の切出しは未解決の実装前gate**である。現行`constructInjectedNativeDiagnosticWorkflow`はbridgeなし／ありで同じprivate関数を使い、停止・guard・acceptにbridge分岐がある。LM03へそのままoptional bridge引数をexportする案は不可。無bridge部分の抽出で旧bridge側の同じ状態機械を丸ごと複製する必要が生じた場合も、copyで進めず最小共通部分を再レビューする。まずLM01／02を先行できるが、これだけでLM03／B-03が完了したとは扱わない。

BG01後の[BG02共有境界draft-0.1](BEST_PRACTICE_NATIVE_DIAGNOSTIC_BG02_BOUNDARY_DESIGN.md)で、4か所のbridge呼出し、旧ND-02／ND-03の共有realm、cleanup／sample／joinの結合を具体化した。先行候補は理由優先順・native factsの値判定だけで、同一性・権限・制御frameを旧rootに残す。resource／private継続が未確定の間は新LM03入口を作らず、BG02完了扱いもしない。

intrinsicの捕捉位置も移行条件に含む。純粋LM01／02ではnative prototypeに触れない。LM03は固定resource層がResponse／stream／readerの操作を捕捉し、実行中にinstance methodやprototypeを引き直さない。旧試験の「prototype故障を注入してからmoduleをfresh import」と同じ捕捉順を維持する。捕捉をownerごとへ移すなどの挙動変更は別レビューで、単なる配置変更と呼ばない。

Response／streamの再利用拒否は同じtest realmの複数owner／runをまたいで必要であり、各ownerごとにWeakSetをリセットして通してはならない。一方でPのruntime台帳・旧fixture台帳・新unit realm・既存D/ST realm間で共有しない。共有できるのは固定関数／readonly intrinsic参照で、live token・reader所有・writer・claimではない。

## 3 artifactと実行区分

| ID | 空出力先・入力の案 | 保証・禁止 |
|---|---|---|
| AR01 | P：本番build＋tarball展開先 | 通常class・source／Permit・既存C方式・worker／0.2／0.3・解放の正対照。tests・LM試験層を本番へ混ぜない。compiled outputがimport不能なだけではfriend不在成功にしない |
| AR02 | U：`.test-build/ef03-unit/`、LM01〜03と固定fixtureの閉包 | 旧ND単体の値・注入resource保証。実class bridgeなし。旧UNの同位置・同入力を保持した保証だけを報告する |
| AR03 | D：`.test-build/ef03-development/`、既存開発root＋固定fixtureの閉包 | 同core会計・source受理・同reader cleanup・比較summary。別brandであり、Uの旧ND形状やPのprivate結合保証と別集計 |
| AR04 | I：固定の非干渉fixture。PとD/Uの承認済みentryだけを同一processでimport | Pの2枠・principal・construction／run理由・会計を保持したままD/Uを実行し不変を確認。Pのsession／lease／sourceはD/Uへ渡さない。別process成功だけでこの非干渉を代替しない |
| AR05 | H：移行前の旧fixtureを旧rootで実行する履歴／併存対照 | B-03準備中は維持。EF-03C後の本番artifactへ旧friendを復元しない。Hの過去成功を新P保証に足さない |

P／U／D／I／Hは生成・実行結果を別記録する。P/U/Dを原則別childとし、Iだけは明示した同一process比較である。fresh ESMのURL変更だけでnative台帳やcaptured intrinsicが初期化されたと推定しない。module realmの範囲を固定し、同realm内の再利用拒否と別realm間のauthority不混入を別々に確認する。

専用buildはrootDirをリポジトリ共通祖先にした明示input閉包とし、src／testsの相対位置を出力内で維持する案。実際のtsconfig名・入力manifest・出力名は実装前レビューで固定する。現行tsconfigのtests除外を外して全testをdistへ出す案は不可。U/D fixtureは自分のbuild内の固定`.js`だけをimportし、ソース・tsx・隣のdist・NODE_PATH・外部loaderへfallbackしない。Pのpack検査はtarball内の実体を使い、リポジトリdistの成功と区別する。

## 4 現行fixtureの移行先・正／負対照

| ID | 現行fixture | 移行先案と未代替部分 |
|---|---|---|
| FX01 | [ND-01 pure](../tests/review/fixtures/compiled-native-status-diagnostic.mjs) | UのLM02へ追加併存。43受理scenarioとstrict拒否を固定oracleで確認。元moduleの4export一致はHに維持し、UではLM02の固定data-only export surfaceを別に検査する |
| FX02 | [ND-02 workflow](../tests/review/fixtures/compiled-native-diagnostic-workflow.mjs) | UのLM03へ追加併存。下記FA01〜24をcompiledで確認。旧4faultだけでUN62全条件の移行完了としない |
| FX03 | [ND-03 real composition](../tests/review/fixtures/compiled-native-session-composition.mjs) | Dのnative連続試験＋Pの入口不在対照に分割する候補。旧same_core／same_source／外側closeの実class保証はRV06／08・AP01に未承認の残差として保持 |
| FX04 | [SA-02 real binding](../tests/review/fixtures/compiled-source-status-binding.mjs) | Dのsource消費・失効とPの入口不在対照へ分ける候補。旧登録ready世代／同constructor／close前受理をDの成功で代替しない |
| FX05 | [CM-04-03 ack](../tests/review/fixtures/compiled-private-composition-ack.mjs) | Dの固定200 bytes会計・ack・比較の別fixtureへ。Pは省略時summary正対照とsynthetic入力拒否を分ける。Dのunknown／mismatched draftと旧prepared拒否は非同等 |
| FX06 | [TB-B handoff](../tests/review/fixtures/compiled-release-time-handoff.mjs) | 同fixtureの純粋TimeHandoff部分と実class synthetic部分を分離する。純粋kernelは固定値・一度移譲／discardを継続し、class側はD補完＋本番未確認として記録。Dの時刻事前入力を空200採取の回復としない |
| FX07 | [EF-02 transaction](../tests/review/fixtures/compiled-construction-transaction.mjs)、[EF-03A kernel](../tests/review/fixtures/compiled-construction-kernel.mjs) | P側の実class正対照として維持。U/Dへ置換しない。factory失敗copy・枠返却・run／construction分離を守る |
| FX08 | [標準worker pack](../tests/review/package-worker.mjs)と通常source／release gate | P側で維持。通常import・Permit／C方式・worker正対照を伴わせ、必要なruntime依存欠落とfriend不在を区別する。実通信を許可する手順ではない |

FX03〜06はAP01〜05の承認後に最終切替する。B-03準備のために旧fixtureをskip／削除する、新しいD結果を旧Pの期待値へ強制変換する、失ったassertionを成功数から省略することは禁止する。

## 5 U：旧UN62条件のcompiled故障matrix

以下のFA範囲は[台帳UN](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-un-01)の全62行を一度ずつ主分類する。これは62件の実行完了ではない。同じreader・window・issuerの故障位置を保つ。D/STに似たcaseがあってもUの代替に数えない。expectedは旧runnerの出力copyではなく、固定入力・操作・phase・元floorと下表の関係から独立に作る。

| ID | 旧UN範囲 | 固定入力／故障位置と独立oracleの受入条件 |
|---|---|---|
| FA01 | UN-01〜05 | 診断owner先行、403／404×body有無。body時reader／closed／cancel／release各1・read0、no_bodyは全操作0。一度発行・一度消費、未観測purposeは未観測のまま |
| FA02 | UN-06〜09 | hard401のbody有無、401／403＋cancel拒否。HTTP先行理由とcleanup未確認を別軸、発行0。cleanup都合で認証失敗を上書きしない |
| FA03 | UN-10 | cancel未完了→元floor→late settle。release試行とtimer終了、seal済みcopy不変、遅延完了でconfirmedへ昇格しない |
| FA04 | UN-11〜13 | issue／pre_guard／post_guardの各取消。phaseに応じissued0または1、consumed0、token保持0、native facts保持 |
| FA05 | UN-14〜16 | 同3phaseで元floor等号。別の10秒／60秒を作らず、消費0・固定期限理由、cleanup確認済み事実を消さない |
| FA06 | UN-17〜19 | 同3phaseでexecute再入。内側invalid_state、外側も拒否・cleanupは一度、first refusalを保持 |
| FA07 | UN-20 | owner／Response再利用。再execute拒否・seal済み履歴不変。別ownerでも同Responseの再利用を拒否 |
| FA08 | UN-21 | 同reader実参照をclosed／cancel／releaseで照合し、操作順reader→closed→cancel→release、read0を独立spyで確認 |
| FA09 | UN-22〜25 | getReader／closed取得／release／closed Promise拒否を個別注入。故障前後の所有を区別し発行0・秘密非出力・元失敗理由。試験側回収を製品cleanup成功へ加算しない |
| FA10 | UN-26 | cancel中stop＋closeの同join。元floorまで同Promiseを待ち、cancel／release一度、未確認copy不変、late結果で書換えない |
| FA11 | UN-27〜29 | 200／302／500。status事実・read0・cleanupを保持し、403／404候補と誤認しない。新しい一般HTTP意味論へ変更しない |
| FA12 | UN-30〜32 | issue／pre／postでclock throw。固定内部理由・消費0・例外本文非出力。cleanup待機のthrowだけで代替しない |
| FA13 | UN-33 | cleanup→issue→pre／postを跨ぐ残時間増加。元lastを保持しinvalid_observation_time、token0。phaseごとにclockをリセットしない |
| FA14 | UN-34〜35 | scheduler throw／disposer throw。元の理由・未確認・再試行0、他の解放試行を省略しない |
| FA15 | UN-36 | 全階層freeze、native handle／writer／consumer／adopt口なし、診断再投入で権限回復0。JSON文字列一致だけで合格しない |
| FA16 | UN-37〜43 | session／consumer／cleanup／anchor／terminal／context／callback供給をconstructor前段で拒否。native／clock未実行、field名だけ変えて受け付けない |
| FA17 | UN-44〜51 | 8つの不正descriptor入力を原条件のまま列挙。purpose／ordinal／window／floor／有限数／区間幅を検査しResponse観測0 |
| FA18 | UN-52 | descriptor／constructorのproxy・accessor、trap呼出し0、固定理由。別delivery profileのgetter拒否で代替しない |
| FA19 | UN-53〜56 | copy_terminal／foreign_terminal／copy_cleanup／foreign_anchor。自claimを先に消費、foreign台帳不変、evidence_binding_mismatch・consumed0 |
| FA20 | UN-57 | consume_twice。二度目invalid_state、先行accepted履歴とconsumed1を保持。元compiled4faultへ黙って集約しない |
| FA21 | UN-58 | fault制御や診断copyの外部注入を通常の注入constructorで拒否。fault runnerは固定scenario専用で、外部のlive tokenを受けない |
| FA22 | UN-59〜60 | 同期budget／schedulerがrejected Promiseを返す。値として受理せずrejectionを観測、発行0・秘密なし・保留を残さない |
| FA23 | UN-61 | public stopへ任意理由を渡しても取消に固定。first reasonとsecret非出力を確認 |
| FA24 | UN-62 | stop後、元floor内でcancel／closedが完了。cleanup確認と非発行を両立し、stopで待機を即切断しない |

## 6 純粋診断・artifact境界の対照

| ID | 固定対照 | 受入条件 |
|---|---|---|
| NC01 | LM02の受理43scenarioとstrict不正入力 | 正規sourceの43名を列挙し、元のprimary／local／refusal／teardown／3purpose、ordinal1とlater数、no_response、freeze・late_ignoredを独立検査。未知・余剰・copy診断・proxy／accessorを拒否。製品診断を受理authorityへ昇格しない |
| NC02 | 純粋entryを、clock／fetch／runtime取得口が使えない条件でimportして実行 | LM01／02からruntime friend・native操作へ到達しない。元module4exportとの一致はHの履歴試験として残し、新entryにprobeを再exportしない |
| NC03 | PからU/Dへのstatic／reexport／dynamic／型／map edgeを1つずつ混入 | 依存閉包・export／構文検査で拒否。禁止名のgrepだけをoracleにしない。EF3-N01／02／04へ対応 |
| NC04 | stale fake JS／宣言／map、synthetic受付・登録本体を1つずつ復活 | 空build／tarball／副作用前拒否検査が各変異で失敗。通常import・省略時summaryは成功。EF3-N03／05／06 |
| NC05 | 必要runtime kernelを1つ欠落 | Pの正対照が失敗。friend不在の負対照の成功と区別。EF3-N07 |
| NC06 | U/Dのtoken／copy／summaryをPの既存入力へ再提出 | private採用口を増設せず拒否。他Pの枠・primary・会計不変。U内部のforeign tokenも自claimだけ消費。EF3-N08／09 |
| NC07 | Iの本番2枠保持中にD/Uの正常・取消・拒否を実行 | Pの状態・枠・principal keyと元理由を前後比較し不変。D/UがPの枠を返さず、Pの3件目busyは維持。最後に各creatorの所有物だけ回収 |
| NC08 | source／tsx／隣distへのfallbackを故障として追加 | import閉包／固定entry検査が失敗。ソースが置いてある環境でたまたま通った成功をcompiled保証にしない |

NC03〜06のP入口不在は撤去後artifact用であり、現HEADで成功を期待する検査ではない。旧取得口がまだある準備中に、検査を弱めて合格させない。正常対照と各変異の非0終了を個別記録し、単なる起動失敗／必要依存欠落と区別する。

## 7 停止・終了・結果記録

fake budget／schedulerでphaseを進め、未解決cancel／closed・late settleを外部の実10秒待機に依存させない。元window／cleanup floorと同期pre/postの故障位置を固定し、新しい製品deadlineを作らない。global／prototypeのspyを戻すのはownerのclose／joinと試験所有resourceの回収を確認した後。hidden reader等の試験側回収は製品のconfirmed creditにしない。未知所有・未完了はunconfirmedのまま保持する。

将来のcompiled child実行には、child上限・親の終了観測／stdio close・cleanup予約を固定する実行契約が必要。現行pack内の当該execFileSyncには明示timeoutがない箇所があり、無条件に既存60秒上限があるとは記録しない。新しいchild上限や外側時間枠は未承認で、起点・根拠・終了確認が固定されるまで実行gateを満たさない。通常並列の対象3件の5秒・既定並列度、別系統の旧比較child60秒、製品の全体60秒を混同・延長しない。

記録はrevision／入力manifest／build・fixtureの識別、区分P/U/D/I/H、元case／variant・fault位置、期待とactual、終了code／理由、終了・cleanupの確認状態、失われる保証と承認IDへ分ける。stdout／stderrは固定summaryと固定理由だけを有限保持し、snapshot／token／URL／body／例外本文を出さない。summaryの一致をidentity証明としない。新しい記録schema・容量・child実行契約は実装前レビュー対象で、既存の採取器／保管先の未承認事項を流用承認しない。

## 8 分割実装案と未解決gate

| ID | 次工程の案 | 完了条件と禁止 |
|---|---|---|
| BG01 | LM01／02の純粋診断抽出・旧wrapperとの共有 | 旧固定scenario・理由・freeze／sealと旧試験を維持し、friendを取らない新entryを追加併存。resource層・bridge・build切替はまだ触らない |
| BG02 | LM03の無bridge注入workflow境界 | [共有境界設計](BEST_PRACTICE_NATIVE_DIAGNOSTIC_BG02_BOUNDARY_DESIGN.md)の値kernel抽出を先行候補とし、resource／制御継続はgate維持。optional bridgeの新export・旧workflow丸ごとcopy・fixture台帳共有は不可。BG01や値抽出の成功で新LM03へ進めない |
| BG03 | UのFA01〜24／NC01〜02とDの固定driverを併存 | 独立oracle・元条件を固定し、旧Uと新U、UとDの保証を別記録。Pのprivate連続性を回復したとは扱わない |
| BG04 | 専用build／固定fixture entry／I非干渉 | rootDir・入力／出力閉包・source fallbackなし、親child終端契約を先に確定。設定変更・child実行には別承認 |
| BG05 | AP01〜05承認後の旧入口／fixture切替とEF-03C／D | 旧ID→新artifact→残差→承認を一つずつ確認。P正対照・NC03〜08、実tarballを満たすまで撤去完了・公開可としない |

- [x] BG01の最小純粋抽出範囲・固定export surfaceを限定実装し、旧試験併存で検証する（§10）。
- [ ] BG02のbridge分岐を新しい権限受付口なしで分離できることを確認する。
- [ ] U/D/Iの専用build・入力manifest・固定entryを承認する。
- [ ] child上限・外側時間枠・stdio／終了確認・記録の有限保持を承認する。
- [ ] AP01〜05と旧case／fixture切替の順序を個別承認する。

BG01の成功はBG02以降の実装指示・承認ではない。bridge共通化の未解決gate、保証低下・公開範囲の未承認、通常並列timeoutの未確定を保持する。

## 9 今回の静的確認

旧ND sourceと6つの主要compiled fixture、pack scriptの直接呼出しと本番tsconfigを読み、43scenario・5faultのsource列挙とfixtureの部分範囲を区別した。3文書のローカルリンク74件・表14個、本書61行ID、FAによるUN62行の重複／欠落0、未承認5項目・差分空白を静的確認した。sourceの43scenario・5faultは構文解析だけで照合し、packのfixture直接参照と現行rootDir／出力／除外も確認した。製品moduleのimport／実行、build、試験再実行、pack、依存導入、child起動、実通信、設定変更・コミット・Pushは未実施。移行済み件数・compiled成功・終了確認済みという新実績は追加しない。

## 10 BG01限定実装・併存検証（2026-11-16）

§9はdraft-0.1作成時の静的確認であり、以下の後続実績と区別する。[state](../src/review/abort-scope-evidence-native-diagnostic-state.ts)は固定3purposeの既存状態機械を移し、引数なしの`createNativeDiagnosticState`でbindingとownerを毎回新規生成する。内部exportは同creatorとreadonlyの`permissions`だけ（型exportは別）。外部binding・既存session・公開診断を採用する口や登録台帳は追加しない。

[pure fixture](../src/review/abort-scope-evidence-native-diagnostic-pure-fixture.ts)のruntime exportは`runSyntheticNativeDiagnosticFixture`だけで、43scenarioのstrict入力・イベント順・返値を維持する。[旧root](../src/review/abort-scope-evidence-native-diagnostic.ts)は同関数を再exportし、元の4exportを維持。旧注入workflowも同じstate creatorを使うが、resource／bridge本文は生成元を置換した1行以外不変である。prototype捕捉位置、Response／Streamsの台帳、旧friendの取得、停止・cleanup・発行／消費分岐には手を入れない。

[独立oracle](../tests/review/fixtures/native-diagnostic-pure-oracle.mjs)は旧runnerの出力から生成せず、43scenarioのprimary／local／refusal・purpose slot・cleanup・acceptance・later数を固定する。[合成試験](../tests/review/native-diagnostic-pure.test.ts)はruntime取得口を拒否するmockとclock／native constructorを使えない条件で新入口を実行し、strict拒否・trap非実行・同値診断の再投入拒否・fresh owner・封印copyとoracleの負の対照を確認する。旧ND純粋試験55件は変更せず併存する。

[新compiled fixture](../tests/review/fixtures/compiled-native-diagnostic-pure.mjs)は現行buildの固定dist `.js`を直接importし、同じ43件の独立値oracle・fresh identity・依存／能力漏出の変異を検査する。TS／source fallbackはない。旧compiled ND-01も変更せず実行した。これは専用U artifactの完成・新child supervisorの実装・旧UN62の移行完了ではない。

型検査・対象lint・build、合成105件、新旧の純粋compiled fixtureが成功。既存除外を維持したoffline梱包dry-runは441file中436のruntime artifactも走査し、新2層の混入0を確認した。`package-http-classification.mjs`へ新2層の除外監査名を追記しただけで、同script全体／全回帰は未実行。詳細と初回試験側誤検出は[検証記録](E2E_BEST_PRACTICE_NATIVE_DIAGNOSTIC_PURE_BG01_2026-11-16.md)へ分離する。

BG02の無bridge resource境界レビュー、UN62の注入故障matrix、専用build・実行／終了契約、P/U/D/I/Hの保証分離、AP01〜06とfriend撤去は残る。通常並列timeoutの解消、正式binding・実認証・実通信・本番の保証回復を今回の結果から主張しない。
