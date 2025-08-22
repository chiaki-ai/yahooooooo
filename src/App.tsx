import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Download, Search, Settings2, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";

// ─────────────────────────────────────────────────────────────
// 定数・初期値
// ─────────────────────────────────────────────────────────────
const defaultQADomains = [
  "chiebukuro.yahoo.co.jp",
  "detail.chiebukuro.yahoo.co.jp",
  "oshiete.goo.ne.jp",
  "okwave.jp",
  "teratail.com",
  "ja.stackoverflow.com",
  "stackoverflow.com",
];

const API_ENDPOINT = "https://www.googleapis.com/customsearch/v1";

// ─────────────────────────────────────────────────────────────
// 型定義
// ─────────────────────────────────────────────────────────────
type SerpItem = { link: string; title: string; snippet: string };
type Result = {
  keyword: string;
  status: "loading" | "ok" | "ng" | "error";
  rank?: number;
  domain?: string;
  serp?: SerpItem[];
  error?: string;
};

// ─────────────────────────────────────────────────────────────
// ユーティリティ
// ─────────────────────────────────────────────────────────────
function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function includesAny(host: string, patterns: string[]): boolean {
  return patterns.some((p) => host === p || host.endsWith("." + p));
}

function saveLocal(key: string, value: any) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error("Failed to save to local storage", e);
  }
}

function loadLocal<T>(key: string, defaultValue: T): T {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch (e) {
    console.error("Failed to load from local storage", e);
    return defaultValue;
  }
}

// ─────────────────────────────────────────────────────────────
// メインコンポーネント
// ─────────────────────────────────────────────────────────────
export default function QAChecker() {
  // State
  const [apiKey, setApiKey] = useState(() => loadLocal("qa_checker_api_key", ""));
  const [cx, setCx] = useState(() => loadLocal("qa_checker_cx", ""));
  const [keywords, setKeywords] = useState("");
  const [qaDomains, setQaDomains] = useState(() =>
    loadLocal("qa_checker_domains", defaultQADomains).join("\n")
  );
  const [results, setResults] = useState<Result[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [expandedKeywords, setExpandedKeywords] = useState<Set<string>>(new Set());
  const [searchRank, setSearchRank] = useState(10);

  // Memos
  const keywordList = useMemo(() => keywords.split("\n").filter(k => k.trim() !== ""), [keywords]);
  const qaDomainList = useMemo(() => qaDomains.split(/[\n,]+/).filter(d => d.trim() !== ""), [qaDomains]);

  // Effects
  useEffect(() => { saveLocal("qa_checker_api_key", apiKey); }, [apiKey]);
  useEffect(() => { saveLocal("qa_checker_cx", cx); }, [cx]);
  useEffect(() => { saveLocal("qa_checker_domains", qaDomainList); }, [qaDomainList]);

  // Handlers
  const handleCheck = async () => {
    if (!apiKey || !cx) {
      alert("APIキーと検索エンジンID (cx) を入力してください。");
      return;
    }
    setIsLoading(true);
    setResults(keywordList.map(k => ({ keyword: k, status: "loading" })));

    for (const keyword of keywordList) {
      try {
        const url = `${API_ENDPOINT}?key=${apiKey}&cx=${cx}&q=${encodeURIComponent(keyword)}&num=${searchRank}&gl=jp&hl=ja`;
        const response = await fetch(url);
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error.message || `HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        const items: SerpItem[] = data.items || [];

        let found: Result | null = null;
        for (let i = 0; i < items.length; i++) {
          const host = hostnameOf(items[i].link);
          if (includesAny(host, qaDomainList)) {
            found = { keyword, status: "ok", rank: i + 1, domain: host, serp: items };
            break;
          }
        }

        const result = found || { keyword, status: "ng", serp: items };
        setResults(prev => prev.map(r => r.keyword === keyword ? result : r));

      } catch (e: any) {
        setResults(prev => prev.map(r => r.keyword === keyword ? { keyword, status: "error", error: e.message } : r));
      }
    }

    setIsLoading(false);
  };

  const toggleExpand = (keyword: string) => {
    setExpandedKeywords(prev => {
      const newSet = new Set(prev);
      if (newSet.has(keyword)) {
        newSet.delete(keyword);
      } else {
        newSet.add(keyword);
      }
      return newSet;
    });
  };

  const exportToCSV = () => {
    const headers = ["Keyword", "Status", "Rank", "Domain"];
    const rows = results.map(r => [
      `"${r.keyword}"`, 
      r.status === 'ok' ? '◎ 狙い目' : '✖ 見送り',
      r.rank ?? "",
      r.domain ?? ""
    ].join(","));
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "qa_check_results.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Render
  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6 md:p-8">
      <div className="max-w-4xl mx-auto">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-gray-800">QA上位チェック</h1>
          <p className="text-gray-500 mt-1">キーワードで検索上位にQ&Aサイトが含まれるか一括チェックします。</p>
        </header>

        <Card className="mb-6">
          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="text-sm font-medium text-gray-700">Google API Key</label>
                <Input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="APIキーを入力" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">検索エンジンID (cx)</label>
                <Input type="password" value={cx} onChange={e => setCx(e.target.value)} placeholder="cx値を入力" />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">キーワード (1行に1つ)</label>
              <Textarea value={keywords} onChange={e => setKeywords(e.target.value)} placeholder="例: 確定申告 やり方\nふるさと納税 おすすめ" rows={6} />
            </div>
            <div className="flex justify-between items-center mt-4">
                <Button onClick={() => setShowSettings(!showSettings)} variant="ghost" size="sm">
                    <Settings2 className="h-4 w-4 mr-2" />
                    設定
                </Button>
                <Button onClick={handleCheck} disabled={isLoading || keywordList.length === 0}>
                    {isLoading ? "チェック中..." : <><Search className="h-4 w-4 mr-2" />チェック実行</>}
                </Button>
            </div>
          </CardContent>
        </Card>

        {showSettings && (
          <Card className="mb-6">
            <CardContent className="p-6">
                <h3 className="text-lg font-semibold mb-2">設定</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="text-sm font-medium text-gray-700">チェックする順位</label>
                        <Input type="number" value={searchRank} onChange={e => setSearchRank(parseInt(e.target.value, 10))} min={1} max={10} />
                    </div>
                    <div>
                        <label className="text-sm font-medium text-gray-700">対象Q&Aドメイン (カンマ or 改行区切り)</label>
                        <Textarea value={qaDomains} onChange={e => setQaDomains(e.target.value)} rows={6} />
                    </div>
                </div>
            </CardContent>
          </Card>
        )}

        {results.length > 0 && (
          <Card>
            <CardContent className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">チェック結果</h3>
                <Button onClick={exportToCSV} variant="outline" size="sm" disabled={results.some(r => r.status === 'loading')}>
                  <Download className="h-4 w-4 mr-2" />
                  CSV出力
                </Button>
              </div>
              <div className="space-y-2">
                {results.map(r => (
                  <div key={r.keyword}>
                    <div className="border rounded-lg p-3 flex items-center justify-between">
                      <div className="flex items-center">
                        <span className={`mr-3 text-xl ${r.status === 'ok' ? 'text-green-500' : r.status === 'ng' ? 'text-red-500' : 'text-gray-400'}`}>
                          {r.status === 'loading' && <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-gray-900"></div>}
                          {r.status === 'ok' && '◎'}
                          {r.status === 'ng' && '✖'}
                          {r.status === 'error' && '⚠️'}
                        </span>
                        <span className="font-medium">{r.keyword}</span>
                        {r.status === 'ok' && <Badge variant="secondary" className="ml-3">{r.rank}位: {r.domain}</Badge>}
                        {r.status === 'error' && <Badge variant="destructive" className="ml-3">エラー</Badge>}
                      </div>
                      {r.serp && r.serp.length > 0 && (
                        <Button variant="ghost" size="sm" onClick={() => toggleExpand(r.keyword)}>
                          {expandedKeywords.has(r.keyword) ? <ChevronUp/> : <ChevronDown />}
                        </Button>
                      )}
                    </div>
                    {expandedKeywords.has(r.keyword) && (
                        <div className="border border-t-0 rounded-b-lg p-4 bg-gray-50">
                            <p className="text-sm font-semibold mb-2">検索結果 (上位{r.serp?.length}件)</p>
                            <ul className="space-y-2">
                                {r.serp?.map((item, index) => (
                                    <li key={item.link} className="flex items-start">
                                        <span className="text-xs text-gray-500 w-6 text-right mr-2">{index + 1}.</span>
                                        <div>
                                            <a href={item.link} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-sm">
                                                {item.title} <ExternalLink className="inline h-3 w-3 ml-1"/>
                                            </a>
                                            <p className="text-xs text-gray-600">{hostnameOf(item.link)}</p>
                                            {includesAny(hostnameOf(item.link), qaDomainList) && <Badge className="mt-1">QAサイト</Badge>}
                                        </div>
                                    </li>
                                ))}
                            </ul>
                            {r.status === 'error' && <p className="text-red-500 text-sm mt-2">エラー: {r.error}</p>}
                        </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
